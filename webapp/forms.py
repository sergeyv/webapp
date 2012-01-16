# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

import json # In the standard library as of Python 2.6
import formish
import schemaish as sc

import sqlalchemy as sa

import webapp.validators as v

from webapp.exc import WebappFormError

from pkg_resources import resource_filename

#from zope.component import getGlobalSiteManager
#gsm = getGlobalSiteManager()


#from zope.interface import Interface, implements
#from zope.component import queryUtility


from collections import defaultdict
import weakref


#_form_registry = {}
#
#def register_form(name, formclass):
#    _form_registry[name] = formclass

from webapp.renderers import safe_json_dumps


#class ILoadableForm(Interface):
    #"""
    #"""

from schemaish.attr import LeafAttribute
class Literal(LeafAttribute):
    """
    A schema attribute which means that the serialization framework
    should just serialize the value of the model's attribute as is,
    without making assumptions about it.
    It's useful to serialize a result of some mnethod which may
    return some complex (but still json-serializable) list or dictionary
    """
    pass


def reflect(cls):
    from sqlalchemy.orm import compile_mappers, object_session, class_mapper
    from sqlalchemy.orm.properties import SynonymProperty
    from sqlalchemy.orm.dynamic import DynamicAttributeImpl
    from sqlalchemy.orm.attributes import ScalarAttributeImpl, ScalarObjectAttributeImpl, CollectionAttributeImpl, InstrumentedAttribute
    from sqlalchemy.orm.attributes import manager_of_class


    def _get_attribute(cls, p):
        manager = manager_of_class(cls)
        return manager[p.key]

    pkeys = [c.key for c in class_mapper(cls).primary_key]

    # attributes we're interested in
    attrs = []
    for p in class_mapper(cls).iterate_properties:
        attr = _get_attribute(cls, p)

        if getattr(p, '_is_polymorphic_discriminator', False):
            continue
        if isinstance(attr.impl, DynamicAttributeImpl):
            continue
        if isinstance(p, SynonymProperty):
            continue
        if isinstance(attr.impl, CollectionAttributeImpl):
            continue
        if isinstance(attr.impl, ScalarObjectAttributeImpl):
            continue
        if attr.key in pkeys:
            continue

        if isinstance(attr.impl, ScalarAttributeImpl):
            attrs.append(attr)
        #fields.AttributeField(attr, self)

    return attrs
    # sort relations last before storing in the OrderedDict
    #L = [fields.AttributeField(attr, self) for attr in attrs]
    #L.sort(lambda a, b: cmp(a.is_relation, b.is_relation))
    #self._fields.update((field.key, field) for field in L)


class AutoSchema(sc.Structure):

    model = None

    def __init__(self, **kwargs):

        super(AutoSchema, self).__init__(**kwargs)
        if 'model' in kwargs:
            self.model = kwargs['model']
        attrs = reflect(self.model)

        for attr in attrs:
            attr_type = attr.property.columns[0].type
            if isinstance(attr_type, sa.Integer):
                self.add(attr.key, sc.Integer())
            elif isinstance(attr_type, sa.DateTime):
                self.add(attr.key, sc.DateTime())
            else:
                self.add(attr.key, sc.String())



def _recursively_augment(form):
    # Find any subforms and call their
    # augment_form methods so we can set up widgets etc.
    #try:
        #print "Schema: %s" % form.name
    #except AttributeError:
        #print "FCJK!: %s" % form
        #return

    for field in form.fields:
        if isinstance(field.attr, sc.Structure):
            _recursively_augment(field)
        elif isinstance(field.attr, sc.Sequence):
            _recursively_augment(field)

    # Augment the form itself. We can override
    # any changes made in the subforms
    if hasattr(form, 'structure'):
        structure = form.structure.attr
    else:
        structure = form.attr

    if hasattr(structure, 'augment_form'):
        structure.augment_form(form)


form_registries = {}

class FormRegistry(object):

    forms = None
    app_name = None

    def __init__(self, app_name):
        self.app_name = app_name
        self.forms = {}
        if app_name in form_registries:
            raise WebappFormError("Form registry %s already exists" % app_name)
        form_registries[app_name] = self


    def loadable(self, cls):
        """
        Registers a formish structure class as a loadable form::

            @loadable
            class TestForm(schemaish.Structure):
                attr1 = sc.String(title="Attribute 1")
                attr2 = sc.String(title="Attribute 2")

                def augment_form(self, form):
                    form['client'].widget = webapp.widgets.FieldsetSwitcher(options=(("1", "One"), ("2", "Two")))

        Then the template can be loaded from /forms/app_name/ClassName
        """
        name = cls.__name__
        schema = cls()
        form = LoadableForm(schema)
        form.name = name

        # Find any subforms and call their
        # augment_form methods so we can set up widgets etc.
        _recursively_augment(form)

        #gsm.registerUtility(form, ILoadableForm, name)
        if name in self.forms:
            raise WebappFormError("Form %s already registered for application %s" % (name, self.app_name))

        self.forms[name] = form

        return cls


    def get_form(self, name):
        return self.forms[name]

# Create a default form registry to support the old behaviour
# TODO: Do we want to remove it eventually?
default_form_registry = FormRegistry('default')

def get_form_registry_by_name(name):
    return form_registries[name]


def loadable(cls):
    """
    A default form registry in case we need only one
    """
    return default_form_registry.loadable(cls)



def get_validators_for_field(field):
    """
    Return a dict with validation rules for a field
    """

    # TODO: Add more validation methods

    validators = {}
    if v.validation_includes(field.attr.validator, v.Email):
        validators['email'] = True

    if v.validation_includes(field.attr.validator, v.Number):
        validators['number'] = True

    if v.validation_includes(field.attr.validator, v.Required):
        validators['required'] = True

    if v.validation_includes(field.attr.validator, v.URL):
        validators['url'] = True

    if v.validation_includes(field.attr.validator, v.DomainName):
        validators['hostname'] = True

    if v.validation_includes(field.attr.validator, v.IPAddress):
        validators['ip_address'] = True

    if v.validation_includes(field.attr.validator, v.RemoteMethod):
        for validator in field.attr.validator.validators:
            if isinstance(validator, v.RemoteMethod):
                validators['remote'] = validator.remote_method


    return validators

def get_field_class_with_validators(field, classes, include=None):
    """
    Returns a string suitable to be used as field's class attribute
    so JQuery.validate can use it
    """

    if not include:
        include = []

    classes_list = include
    classes_list.extend(get_validators_for_field(field))
    if classes:
        if isinstance(classes, basestring):
            classes_list.extend(classes.split(' '))
        else:
            for c in classes:
                if isinstance(c, basestring):
                    cs = c.split(' ')
                else:
                    cs = c
                classes_list.extend(cs)
    return ' class="%s"'%' '.join(classes_list)

def is_option_selected(option, field):
    """
    Returns selected="selected" if the option value
    matches field's default
    """
    if field.attr.default and option[0] == field.attr.default: # and option[0] != self.empty:
        return ' selected="selected"'
    else:
        return ''


class LoadableForm(formish.Form):
    """
    A form which can be loaded by the client's code.
    Forms are served as `/form/LoadableForm`, where "LoadableForm is the class name
    """

    #implements(ILoadableForm)


    renderer = formish.renderer.Renderer([resource_filename('webapp', 'templates/mako')])

    @classmethod
    def add_overrides_directory(cls, module_name, dir_name):
        res = [
            resource_filename(module_name, dir_name),
            resource_filename('webapp', 'templates/mako'),
            ]
        cls.renderer = formish.renderer.Renderer(res)


    def get_js_validation_rules(self):
        """
        Generates a bit of JS which is suitable for
        passing to JQuery.validate plugin as a set of validation
        rules, so the validation is the same client- and server-side
        """

        rules = {}
        for field in self.allfields:
            validators = get_validators_for_field(field)

            if validators: # empty dict is false-ish
                rules[field.name] = validators

        return safe_json_dumps(rules)


    def get_html(self):
        """
        Returns html representation of the form, along with a small JS snippet
        which sets up validation rules
        (template takes care of that now)
        """
        return self()


from schemaish.attr import Container

class Group(Container):

    attrs = []

    def __init__(self, attrs=None, **k):
        """
        Create a new structure.

        @params attrs: List of (name, attribute) tuples defining the name and
            type of the structure's attributes.
        """
        super(Group, self).__init__(**k)
        # If attrs has been passed as an arg then use that as the attrs of the
        # structure. Otherwise use the class's attrs, making a copy to ensure
        # that any added attrs to the instance do not get appended to te
        # class's attrs.
        if attrs is not None:
            self.attrs = attrs
        else:
            self.attrs = list(self.attrs)

    @property
    def default(self):
        return dict( [(name, getattr(a,'default',None)) for name, a in self.attrs] )

