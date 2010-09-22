# -*- coding: utf-8 -*-

import json # In the standard library as of Python 2.6
import validatish as v

def js_validation_rules_from_form(form):
    """
    Generates a bit of JS which is suitable for
    passing to JQuery.validate plugin as a set of validation
    rules, so the validation is the same client- and server-side
    """

    rules = {}
    # TODO: Add more validation methods
    # TODO: Add remote validation support
    for field in form.fields:
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


def loadable_form_view(form_class):
    """
    """
    form = form_class.get_form()
    js = """<script language="javascript">
    (function(app) {
        var rules = %(rules)s;
        app.addValidationRules("%(name)s", rules);
    })(window.application);
    </script>""" % {'name': form.name, 'rules':js_validation_rules_from_form(form)}
    return js + form()
