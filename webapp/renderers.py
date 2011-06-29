# -*- coding: utf-8 -*-
import datetime
import json
import re

from decimal import Decimal

_JS_DATE_REGEXP = re.compile(r'"\*\*(new Date\([0-9,]+\))"')

class _JSONDateEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime.datetime):
            return obj.isoformat()

        if isinstance(obj, datetime.date):
            #return obj.strftime("%d %b %Y")
            return obj.isoformat()

        if isinstance(obj, Decimal):
            return float(obj)

        return json.JSONEncoder.default(self, obj)


def safe_json_dumps(obj):
    """
    Improved version of json.dumps which support more datatypes
    """
    out = _JS_DATE_REGEXP.sub(r'\1', json.dumps(obj, cls=_JSONDateEncoder))
    return unicode(out).decode('utf-8')

def json_renderer_factory(name):

    def _dumps(obj):
        """ A (simple)json wrapper that can wrap up python datetime and date
        objects into Javascript date objects.
        @param obj: the python object (possibly containing dates or datetimes) for
            (simple)json to serialize into JSON

        @returns: JSON version of the passed object
        """
        return safe_json_dumps(obj)

    def _render(value, system):
        request = system.get('request')
        if request is not None:
            if not hasattr(request, 'response_content_type'):
                request.response_content_type = 'application/json'
        return _dumps(value)
    return _render