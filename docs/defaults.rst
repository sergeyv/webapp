###################
Form default values
###################

Webapp's ``serialize`` method takes into account form's defaults,
which are used when a field's value is None. So to specify a simple
default value (a string which never changes etc.), simply pass it
as ``default`` attribute of schemaish structure::

    class DNSRecordEditSub(sc.Structure):
        record_type = sc.String(title="Type", validator=v.Required(), default='A')
        ...
        ttl = sc.Integer(title='TTL', validator=v.Required(), default=38400)


In some cases, however, we need a default to be different each time
a form is invoked. The most popular use for this is to make date fields default to today's date.

The obvious solution would be to assign a function to be a default, however, it makes formish unhappy, so we need a workaround.

``webapp.defaults`` defines a ``DynamicDefault`` class. When the serializer sees a subclass of ``DynamicDefault`` as a default value of an attrubute,
it calls it, passing the item being serializing and the attribute name. At the same time, the class may behave in a way which makes formish happy, i.e. classes which return datetime.datetime values need to have isoformat method (though it just returns an empty string).

So, cutting to the chase, to define a datetime field which defaults to
the current date, do the following::

    join_date = sc.Date(
        title="Join Date",
        default=webapp.DateTimeDefaultNow(),
    )

More "dynamic defaults" may be added in the future.
