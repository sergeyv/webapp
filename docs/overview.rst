:mod:`webapp` Overview
=======================

The main parts of the framework are:

RESTful backend
---------------

RESTful backend uses JSON as its data protocol. It is based on crud - rest.py contains implementations
of RestResource and RestCollection which know how to return data in JSON format and create/update/delete objects
using JSON data submitted by the client.


Forms
-----

webapp uses formish library to provide forms with no or minimal client-side coding.

Loadable Forms
""""""""""""""

a schemaish structure can be registered as a 'loadable',
so it can ce loaded by the client-side code.
Apart from form's html, validation rules defined in the schema are also passed to the client::

    @webapp.loadable
    SimpleForm(sc.Structure):
        name = sc.String(title="Name", validator=v.Required())
        value = sc.String(title="Value")


Data Formats
""""""""""""
Forms are also used to define "data formats" to serialize data coming to and from the server::

    @crud.resource(models.Student)
    class StudentResource(webapp.RestResource):
        pass

    class StudentsCollection(webapp.RestCollection):
        subitems_source = models.Student

Then we register a couple of forms as 'data formats' of StudentResurce::

    @webapp.loadable
    @StudentsCollection.listing_format('list')
    class StudentListing(sc.Structure):
        last_name=sc.String()
        initial=sc.String()
        age=sc.String()

    @webapp.loadable
    @StudentResource.readwrite_format
    class StudentViewForm(sc.Structure):
        first_name = sc.String()
        last_name = sc.String()
        date_of_birth = sc.String()
        # Schemas can contain other schemas,
        # which will be serialized recursively
        favourite_book = sc.Structure(attrs=dict(
            id=sc.String(),
            title=sc.String(),
        ))


Now the client can request data in a specific format::

    GET /students/@list

which will return::

    {items: [
        {last_name:"Smith", initial:"J", age:"21"},
        ...
    ]}

Forms are also used to de-serialize data coming from the client and create/update SA models


Data formats inheritance
""""""""""""""""""""""""

NOTE: This feature does not work at the moment

Data formats defined in parent classes can be used in descendent classes too. Inheritance is only needed on the level of SA models, Resource classes do not need to relate to each other::

    class Institution(webapp.Base):
        ...

    class School(Institution):
        ...

Now on to resources declaration::

    @crud.resource(models.Institution)
    class InstitutionResource(webapp.RestResource):
        data_formats = {
            'view': 'InstitutionView',
        }

    @crud.resource(models.School)
    class SchoolResource(webapp.RestResource):
        data_formats = {
            'edit': 'SchoolEdit',
        }

Define some forms::

    @Institution.readonly_format('view')
    class InstitutionView(sc.Structure):
        ...

    @webapp.loadable
    @SchoolResource.readwrite_format
    class SchoolEdit(sc.Structure):
        ...

As you can see, SchoolResource does not define ``view`` data format. However, if we request ``/rest/schools/123/@view``, the framework will detect that SchoolResource is a resource for the School model, and School model is a subclass of Institution, and the resource registered for Institution (InstitutionResource) does indeed define that format, so it will be used to serialize the data.


Client
""""""

The client part of webapp is a jQuery-based framework. The main concepts are:
    - Controller, which is a JS class which registers some _routes_, much like Django or Pylons do

    - route is a mapping of URL's "hash slack", i.e. the anchor part which comes after #, to a View.

    - a View is a JS object which displays data on the page. Generally a view is associated to some <div /> on the page.

    - Application object, which monitors the changes in the hash slack and notifies Controller, which shows/hides views
    according to its registered routes

