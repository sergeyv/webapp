
import schemaish as sc
import sqlalchemy as sa

from sqlalchemy.orm import compile_mappers, object_session, class_mapper
from sqlalchemy.orm.properties import SynonymProperty
from sqlalchemy.orm.dynamic import DynamicAttributeImpl
from sqlalchemy.orm.attributes import ScalarAttributeImpl, ScalarObjectAttributeImpl, CollectionAttributeImpl, InstrumentedAttribute
from sqlalchemy.orm.attributes import manager_of_class


def reflect(cls):

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

    return attrs
    # sort relations last before storing in the OrderedDict
    #L = [fields.AttributeField(attr, self) for attr in attrs]
    #L.sort(lambda a, b: cmp(a.is_relation, b.is_relation))
    #self._fields.update((field.key, field) for field in L)


def auto_schema(model_cls):
    """
    A decorator to auto-reflect model's attributes
    and create a schema::

        @webapp.auto_schema(models.User)
        class UserView(sc.Structure):
            extra_attr = sc.String()

    Any attributes reflected from the model will be
    appended to the attributes manually defined on the
    schema class
    """

    def _inner(schema_cls):
        attrs = reflect(model_cls)
        for attr in attrs:
            print ""
            attr_type = attr.property.columns[0].type
            if isinstance(attr_type, sa.Integer):
                value = sc.Integer()
            elif isinstance(attr_type, sa.DateTime):
                value = sc.DateTime()
            else:
                value = sc.String()

            print "SETTING %s on %s to %s" % (attr.key, schema_cls, value)
            setattr(schema_cls, attr.key, value)
            # sc.Structure is based on _StructureMeta metaclass
            # which builds a list of all schema attributes when a new subclass
            # of sc.Structure is created. See attr.py in schemaish
            schema_cls.__schemaish_structure_attrs__.append((attr.key, value))
            schema_cls.attrs.append((attr.key, value))
        return schema_cls

    return _inner
