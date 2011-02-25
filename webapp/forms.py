# -*- coding: utf-8 -*-

import json # In the standard library as of Python 2.6
import formish
import schemaish as sc
import validatish as v


from pkg_resources import resource_filename

from zope.component import getGlobalSiteManager
gsm = getGlobalSiteManager()


from zope.interface import Interface, implements
from zope.component import queryUtility

#_form_registry = {}
#
#def register_form(name, formclass):
#    _form_registry[name] = formclass


class ILoadableForm(Interface):
    """
    """


class loadable_form(object):
    """
    A decorator to declare the form object as loadable
    The decorator returns a _form object_, not a function
    (but thre form object is callable anyway)

    However, the decorated function is not supposed to be called
    """

    def __init__(self, name):
        self.name = name

    def __call__(self, f):
        print "DEPRECATED: loadable_form decorator is deprecated"
        form = f()
        form.name = self.name
        gsm.registerUtility(form, ILoadableForm, self.name)
        return form


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
        
    #import pdb; pdb.set_trace()

    return attrs
    # sort relations last before storing in the OrderedDict
    #L = [fields.AttributeField(attr, self) for attr in attrs]
    #L.sort(lambda a, b: cmp(a.is_relation, b.is_relation)) 
    #self._fields.update((field.key, field) for field in L)


class AutoSchema(sc.Structure):

    model = None
    
    def __init__(self, **kwargs):

        super(AutoSchema, self).__init__(**kwargs)
        attrs = reflect(self.model)
        for attr in attrs:
            self.add(attr.key, sc.String())
        

def loadable(cls):
    """
    Registers a formish structure class as a loadable form

    @loadable
    class TestForm(schemaish.Structure):
        attr1 = sc.String(title="Attribute 1")
        attr2 = sc.String(title="Attribute 2")

        def augment_form(self, form):
            form['client'].widget = webapp.widgets.FieldsetSwitcher(options=(("1", "One"), ("2", "Two")))

    Then the template can be loaded from /forms/ClassName
    """
    name = cls.__name__
    schema = cls()
    form = LoadableForm(schema)
    form.name = name

    # Find any subforms and call their
    # augment_form methods so we can set up widgets etc.
    for key in dir(schema):
        if key.startswith('_'):
            continue
        print "FORM KEY: %s" % key
        schema_field =  getattr(schema, key)
        if isinstance(schema_field, sc.Structure):
            subschema = schema_field
            subform = form[key]
            if hasattr(subschema, 'augment_form'):
                subschema.augment_form(subform)

    # Augment the form itself. We can override
    # any changes made in the subforms
    if hasattr(cls, 'augment_form'):
        schema.augment_form(form)
    gsm.registerUtility(form, ILoadableForm, name)
    print "Registered loadable form %s" % name
    return cls



def get_form(name):
    return queryUtility(ILoadableForm, name)


class LoadableForm(formish.Form):
    """
    A form which can be loaded by the client's code.
    Forms are served as `/form/LoadableForm`, where "LoadableForm is the class name
    """

    implements(ILoadableForm)


    renderer = formish.renderer.Renderer([resource_filename('webapp', 'templates/mako')])

    def get_js_validation_rules(self):
        """
        Generates a bit of JS which is suitable for
        passing to JQuery.validate plugin as a set of validation
        rules, so the validation is the same client- and server-side
        """

        rules = {}
        # TODO: Add more validation methods
        # TODO: Add remote validation support
        for field in self.fields:
            validators = {}
            if v.validation_includes(field.attr.validator, v.Required):
                validators['required'] = True

            if v.validation_includes(field.attr.validator, v.Email):
                validators['email'] = True

            if v.validation_includes(field.attr.validator, v.URL):
                validators['url'] = True

            if len(validators.keys()):
                rules[field.name] = validators

        return json.dumps(rules)


    def get_html(self):
        """
        Returns html representation of the form, along with a small JS snippet
        which sets up validation rules
        """
        #form = form_class.get_form()
        js = """<script language="javascript">
        (function(app) {
            var rules = %(rules)s;
            app.addValidationRules("%(name)s", rules);
        })(window.application);
        </script>""" % {'name': self.name, 'rules':self.get_js_validation_rules()}
        return js + self()
