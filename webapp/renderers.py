# -*- coding: utf-8 -*-
import datetime
import json
import re



_JS_DATE_REGEXP = re.compile(r'"\*\*(new Date\([0-9,]+\))"')

def json_renderer_factory(name):

    class _JSONDateEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, datetime.datetime):
                return "%s-%s-%s" % (obj.year, obj.month, obj.day)
                #return '**new Date(%i,%i,%i,%i,%i,%i)' % (obj.year,
                #                                        obj.month-1,
                #                                        obj.day,
                #                                        obj.hour,
                #                                        obj.minute,
                #                                        obj.second)
            if isinstance(obj, datetime.date):
                return "%s-%s-%s" % (obj.year, obj.month, obj.day)
                #return '**new Date(%i,%i,%i)' % (obj.year,
                #                                obj.month-1,
                #                                obj.day)
            return json.JSONEncoder.default(self, obj)



    def _dumps(obj):
        """ A (simple)json wrapper that can wrap up python datetime and date
        objects into Javascript date objects.
        @param obj: the python object (possibly containing dates or datetimes) for
            (simple)json to serialize into JSON

        @returns: JSON version of the passed object
        """
        out = _JS_DATE_REGEXP.sub(r'\1', json.dumps(obj, cls=_JSONDateEncoder))
        return unicode(out).decode('utf-8')


    def _render(value, system):
        request = system.get('request')
        if request is not None:
            if not hasattr(request, 'response_content_type'):
                request.response_content_type = 'application/json'
        print "Custom json renderer!"
        return _dumps(value)
    return _render