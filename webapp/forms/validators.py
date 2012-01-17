
import webapp.validators as v


def get_validators_for_field(field):
    """
    Return a dict with validation rules for a field
    Used directly in widget templates
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

    if v.validation_includes(field.attr.validator, v.Min):
        for validator in field.attr.validator.validators:
            if isinstance(validator, v.Min):
                validators['min'] = validator.min_val

    if v.validation_includes(field.attr.validator, v.Max):
        for validator in field.attr.validator.validators:
            if isinstance(validator, v.Max):
                validators['max'] = validator.max_val

    if v.validation_includes(field.attr.validator, v.RemoteMethod):
        for validator in field.attr.validator.validators:
            if isinstance(validator, v.RemoteMethod):
                validators['remote'] = validator.remote_method


    return validators

def get_field_class_with_validators(field, classes, include=None):
    """
    Returns a string suitable to be used as field's class attribute
    so JQuery.validate can use it
    Used directly in widget templates
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
    Used directly in widget templates
    """
    if field.attr.default and option[0] == field.attr.default: # and option[0] != self.empty:
        return ' selected="selected"'
    else:
        return ''


