# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################


from pyramid.security import Allow

import sqlalchemy as sa
from zope.interface import implements

import crud

from webapp.db import get_session
from webapp.exc import WebappFormError
from webapp.forms import get_form_registry_by_name

FORMAT_ALREADY_REGISTERED_MSG = """
Format %(fmt_name)s has been already registered for %(resource)s,
   the current value is: %(current)s
   trying to re-register with: %(new)s
"""


class IRestRootCollection(crud.ICollection):
    pass


class RestSubobject(crud.Traversable):
    """
    A base class for a "virtual" subobject which has no database-level
    representation::

        class AutoresponderResource(webapp.RestSubobject):

            def serialize(self, format='default', annotate=False):
                email = self.__parent__.model
                print "TADA, serialize called"
                return email.invoke_action('get_autoresponder')

            def deserialize(self, params, request):
                email = self.__parent__.model
                return invoke_action_after_commit(email, "set_autoresponder", params, request)

    Then we can use it like this::

        @crud.resource(models.EmailAddress)
        class EmailAddressResource(RecordableResource):

            subsections = {
                'autoresponder': AutoresponderResource,
            }

    And finally, we can have a REST API endpoint at /rest/emails/123/autoresponder -
    a GET request would return autoresponder status, a PUT request would set autoresponder

    We can directly see and manipulate the data in a form::

        c.route("/emails/:item_id/set-autoresponder", new webapp.Form({
            title: "Set Automatic Reply",
            identifier: "EmailAddressSetAutoresponder",
            rest_service_root: "/rest/emails/:item_id/autoresponder"
        }));

    NOTE: Now you can achieve virtually the same results with standard
    data formats machinery
    """
    implements(crud.IResource)

    @property
    def model(self):
        return self.__parent__.model

    def update(self, params, request):
        """
        Override the crud's method to call "item updated" hooks
        """
        self.deserialize(params, request)
        if hasattr(self, "after_item_updated"):
            self.after_item_updated(request)


from webapp.forms.data_format import (
    DataFormatReader,
    DataFormatWriter,
    DataFormatReadWrite,
    DataFormatLister,
    DataFormatCreator,
    DataFormatDeletor,
    VocabLister
    )


class FormAwareMixin(object):
    """
    A mixin which enables "local form-awareness", i.e. we can register
    a form registry on a node in our content tree, and all sub-nodes within that
    branch will find and use that registry
    """

    form_registry = None

    def find_form_registry(self):
        if self.form_registry is not None:
            if isinstance(self.form_registry, basestring):
                return get_form_registry_by_name(self.form_registry)
            return self.form_registry

        if (self.__parent__ is not None) and hasattr(self.__parent__, 'find_form_registry'):
            return self.__parent__.find_form_registry()

        return get_form_registry_by_name('default')

    def __getitem__(self, name):

        if name.startswith('@'):
            data_format_factory = self._find_data_format(name[1:])
            data_format_obj = data_format_factory()
            data_format_obj.__name__ = name
            data_format_obj.__parent__ = self
            data_format_obj.__acl__ = data_format_obj.get_acl()
            return data_format_obj

        return crud.Traversable.__getitem__(self, name)

    def _find_data_format(self, format):
        """
        Find a data format registered for the resource by its name
        """
        try:
            return self.__data_formats__[format]
        except AttributeError:
            raise WebappFormError('No formats registered for %s, class %s, looking for "%s"' % (self, self.__class__, format))
        except KeyError:
            raise WebappFormError('Format "%s" is not registered with %s' % (format, self))

    @classmethod
    def _data_format_decorator(cls, name_or_cls, wrapper_cls):
        """
        Base class for reader, writer and other decorator methods
        """

        if isinstance(name_or_cls, basestring):
            additional_name = name_or_cls
        else:
            additional_name = None

        def inner(schemaish_cls):
            if not hasattr(cls, '__data_formats__'):
                cls.__data_formats__ = {}
            formats_dict = cls.__data_formats__

            if not hasattr(schemaish_cls, "__allow_loadable__"):
                schemaish_cls.__allow_loadable__ = wrapper_cls.__allow_loadable__

            data_format_factory = wrapper_cls(schemaish_cls)

            # register the format with the name of the schema class, i.e. ContactEditForm
            if schemaish_cls.__name__ in formats_dict:
                raise WebappFormError(FORMAT_ALREADY_REGISTERED_MSG % {
                    'fmt_name': schemaish_cls.__name__,
                    'resource': cls,
                    'current': formats_dict[schemaish_cls.__name__],
                    'new': data_format_factory
                })
            formats_dict[schemaish_cls.__name__] = data_format_factory
            # also, if the format was registeres with
            # @ContactResource.readwrite_format('edit'), we register the format with
            # the name provided
            if additional_name is not None:
                formats_dict[additional_name] = data_format_factory
            # it's important to return it otherwise nested decorators won't work
            return schemaish_cls

        if isinstance(name_or_cls, basestring):
            # we were passed a string which means the decorator was called
            # with @Resource.reader('name') syntax - return the inner function
            # which in turn will be called
            # with the DataFormat class as its parameter
            return inner

        # we were passed a class, which means the decorater was used without
        # ('name') so we invoke the inner function directly
        return inner(name_or_cls)

    @classmethod
    def readonly_format(cls, name_or_cls):
        """
        A decorator to assign a DataFormat subclass as a READ data format
        for the given resource::

                @ContactResource.readonly_format
                class ContactResourceView(sc.Structure):

        in which case the format will be available as `/rest/contacts/123`

        Alternatively, we can pass a name to the decorator::

                @ContactResource.readonly_format('test')
                class ContactResourceView(sc.Structure):
        """

        return cls._data_format_decorator(name_or_cls, DataFormatReader)

    @classmethod
    def writeonly_format(cls, name_or_cls):
        """
        """

        return cls._data_format_decorator(name_or_cls, DataFormatWriter)

    @classmethod
    def readwrite_format(cls, name_or_cls):
        """
        """
        return cls._data_format_decorator(name_or_cls, DataFormatReadWrite)

    @classmethod
    def listing_format(cls, name_or_cls):
        """
        """
        return cls._data_format_decorator(name_or_cls, DataFormatLister)

    @classmethod
    def create_format(cls, name_or_cls):
        """
        """
        return cls._data_format_decorator(name_or_cls, DataFormatCreator)

    @classmethod
    def delete_format(cls, name_or_cls):
        """
        Only one delete fromat can be registered for a resource
        """
        name = cls.__name__ + 'Delete'
        if name_or_cls.__name__ != name:
            raise WebappFormError("A delete format for %s should be called %s instead of %s" % (
                cls, name, name_or_cls.__name__)
            )
        return cls._data_format_decorator(name_or_cls, DataFormatDeletor)

    @classmethod
    def allow_vocab_listing(cls, *args):
        """

        """
        if not hasattr(cls, '__data_formats__'):
            cls.__data_formats__ = {}

        v = cls.__data_formats__.setdefault('vocab', VocabLister())

        for role in args:
            t = (Allow, role, 'rest.list',)
            if not t in v.__acl__:
                v.__acl__.append(t)


class RestCollection(FormAwareMixin, crud.Collection):
    """
    Just like a normal crud.Collection but
    has some additional methods expected by rest views

    rest sections need to subclass this
    """

    ### Some 'sane' defaults for an unlikely case the frontent does not tell
    ### us how much results it wants or asks for an unrelistic or stupid number
    DEFAULT_RECORDS_PER_BATCH = 50
    MIN_RECORDS_PER_BATCH = 3
    MAX_RECORDS_PER_BATCH = 400
    LIMIT_INCREMENTAL_RESULTS = 25

    # by default we search by 'name' field. A subclass may
    # override this setting to provide more than one field
    # which will be ORed togeter
    # i.e. ... WHERE name LIKE 'abc%' OR hostname LIKE 'abc%' ...
    search_fields = ('name',)


    def get_empty(self, request):
        """
        Returns an empty subitem - i.e. with all fields either
        empty or set to default values
        """
        format = request.GET.get('format', 'listing')

        session = get_session()
        session.autoflush = False

        item = self.create_transient_subitem()
        session.add(item)

        resource = self.wrap_child(item, name="empty")

        # TODOXXX: Change this
        data = resource.serialize(format=format)

        import transaction
        transaction.abort()
        return data



    def get_incremental(self, request):
        """
        Generic method for incremental search -
        requires the object to have 'name' attribute

        Returns just a list of strings
        """

        data = {}

        model_class = self.subitems_source

        query = get_session().query(model_class)


        get_id_for = request.GET.get('get_id_for', None)
        if get_id_for is not None:
            cli = query.filter(model_class.name == get_id_for).one()
            return {'id': cli.id, 'name': cli.name}

        ### Filter-able fields:
        name_filter = request.GET.get('term', None)

        # TODO: LIKE parameters need escaping
        if name_filter:
            query = query.filter(model_class.name.ilike(name_filter + '%'))

        query = query.order_by(model_class.name)

        items = query[:self.LIMIT_INCREMENTAL_RESULTS]

        result = []

        for item in items:
            i = {}
            i['id'] = item.id
            i['title'] = str(item)
            result.append(str(item))

        data = result
        return data





class RestResource(FormAwareMixin, crud.Resource):
    """
    Some additional methods for formatting
    """


