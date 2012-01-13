
import formish
import schemaish as sc
from pkg_resources import resource_filename

from webapp.renderers import safe_json_dumps

from .validators import get_validators_for_field

class LoadableForm(formish.Form):
    """
    A form which can be loaded by the client's code.
    Forms are served as `/form/LoadableForm`, where "LoadableForm is the class name
    """

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




form_registries = {}


def _recursively_augment(form):
    """
    Find any subforms and call their
    augment_form methods so we can set up widgets etc.
    """

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


class FormRegistry(object):

    forms = None
    app_name = None

    def __init__(self, app_name):
        self.app_name = app_name
        self.forms = {}
        if app_name in form_registries:
            raise ValueError("Form registry %s already exists" % app_name)
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
            raise ValueError("Form %s already registered for application %s" % (name, self.app_name))

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
