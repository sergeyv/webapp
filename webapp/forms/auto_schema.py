
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


class AutoSchema(sc.Structure):

    model = None

    def __init__(self, **kwargs):

        super(AutoSchema, self).__init__(**kwargs)
        if 'model' in kwargs:
            self.model = kwargs['model']
        attrs = reflect(self.model)

        for attr in attrs:
            attr_type = attr.property.columns[0].type
            if isinstance(attr_type, sa.Integer):
                self.add(attr.key, sc.Integer())
            elif isinstance(attr_type, sa.DateTime):
                self.add(attr.key, sc.DateTime())
            else:
                self.add(attr.key, sc.String())


