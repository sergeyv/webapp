##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

from datetime import datetime

__all__ = ("DynamicDefault", "DateTimeDefaultNow")


class DynamicDefault(object):
    pass

class DateTimeDefaultNow(DynamicDefault):

    def __call__(self, item, attr_name):
        return datetime.now()

    def isoformat(self, *args, **kwargs):
        return "1970-01-01"
