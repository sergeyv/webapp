##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

# This module import some suppoted validators from validatish,
# and also defines a few of its own.

# Firstly we import supported validators from validatish
# so the calling code need not to care where to import the stuff from
# - webapp.validators is a single canonical place

from validatish import Required
from validatish import Email
from validatish import URL
from validatish import Number
from validatish import DomainName
from validatish import All

# Need this for forms.py
from validatish import validation_includes

# Import our custom validators:

from .ip_address import IPAddress
from .remote_method import RemoteMethod
