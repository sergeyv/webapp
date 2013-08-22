
import bleach
import schemaish as sc
# from schemaish.attr import Container
# from schemaish.attr import LeafAttribute


class Literal(sc.attr.LeafAttribute):
    """
    A schema attribute which means that the serialization framework
    should just serialize the value of the model's attribute as is,
    without making assumptions about it.
    It's useful to serialize a result of some method which may
    return some complex (but still json-serializable) list or dictionary
    """
    pass

# added <br> and <p> to the list of allowed tags, removed <code>


# TODOXXX: When we implement #1422 Use un-linkified contents in libra we'll need to remove 'a' from the list
# of allowed tags
ALLOWED_TAGS = ['a', 'abbr', 'acronym', 'b', 'br', 'blockquote', 'div', 'em', 'i', 'li', 'ol', 'p', 'strong', 'ul']


class SafeHTML(sc.String):
    """
    A schema attribute which is cleaned using lxml/clean_html on save
    """

    @staticmethod
    def clean(value):
        value = value.strip()
        if not value:
            return None
        value = bleach.clean(value, tags=ALLOWED_TAGS, strip=True)
        # Chromium insers <div> for plain text pasted into the contentEditable field
        value = value.replace('<div>', '<p>').replace('</div>', '</p>')

        # server-side parsing does not work well with our editor
        #value = bleach.linkify(value)
        return value


        #cleaner = lxml.html.clean.Cleaner(style=True)
        #try:
        #    doc = lxml.html.fromstring(value)
        #except:
        #    doc = lxml.html.soupparser.fromstring(value)

        #cleaner(doc)
        #lxml.html.clean.autolink(doc)
        #lxml.html.clean.word_break(doc)
        #return lxml.html.tostring(doc)


class Group(sc.attr.Container):

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
        return dict([(name, getattr(a, 'default', None)) for name, a in self.attrs])

