
import re

from validatish.error import Invalid
from validatish import Validator

# The patterns is from here: http://regexlib.com/REDetails.aspx?regexp_id=1070

_ip_address_regex = re.compile(r"^((\d|\d\d|[0-1]\d\d|2[0-4]\d|25[0-5])\.(\d|\d\d|[0-1]\d\d|2[0-4]\d|25[0-5])\.(\d|\d\d|[0-1]\d\d|2[0-4]\d|25[0-5])\.(\d|\d\d|[0-1]\d\d|2[0-4]\d|25[0-5]))$", re.I)

def is_ip_address(value, messages=None):
    """
    Validate the value looks like an IP address.
    """
    if value is None:
        return
    _messages = {
        'type-string': "must be a string",
        'invalid': "is invalid",
    }
    if messages:
        _messages.update(messages)
    if not isinstance(value, basestring):
        raise Invalid(_messages['type-string'])
    if _ip_address_regex.match(value) is None:
        raise Invalid(_messages['invalid'])

class IPAddress(Validator):
    """
    Checks whether value looks like an IP address.
    Only IPv4 addresses are supported currently
    """

    def __init__(self, messages=None):
        self.messages = messages

    def __call__(self, v):
        try:
            is_ip_address(v, messages=self.messages)
        except Invalid, e:
            raise Invalid(e.message, validator=self)

