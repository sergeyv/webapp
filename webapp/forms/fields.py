

from schemaish.attr import Container
from schemaish.attr import LeafAttribute


class Literal(LeafAttribute):
    """
    A schema attribute which means that the serialization framework
    should just serialize the value of the model's attribute as is,
    without making assumptions about it.
    It's useful to serialize a result of some mnethod which may
    return some complex (but still json-serializable) list or dictionary
    """
    pass


class Group(Container):

    attrs = []

    def __init__(self, attrs=None, **k):
        """
        Create a new structure.

        @params attrs: List of (name, attribute) tuples defining the name and
            type of the structure's attributes.
        """
        super(Group, self).__init__(**k)
        # If attrs has been passed as an arg then use that as the attrs of the
        # structure. Otherwise use the class's attrs, making a copy to ensure
        # that any added attrs to the instance do not get appended to te
        # class's attrs.
        if attrs is not None:
            self.attrs = attrs
        else:
            self.attrs = list(self.attrs)

    @property
    def default(self):
        return dict( [(name, getattr(a,'default',None)) for name, a in self.attrs] )


