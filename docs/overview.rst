:mod:`webapp` Overview
===============

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

    @webapp.loadable
    class StudentListing(sc.Structure):
        last_name=sc.String()
        initial=sc.String()
        age=sc.String() 

    @webapp.loadable
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

Then we register these two forms as 'data formats' of StudentResurce::

    crud.resource(models.Student)
    class StudentProxy(webapp.RestProxy):
        data_formats = {
            'default': StudentListing,
            'view': StudentAddForm,
        }

Now the client can request data in a specific format::

    GET /students?format=listing

which will return::

    {items: [
        {last_name:"Smith", initial:"J", age:"21"},
        ...
    ]}

Forms are also used to de-serialize data comig from the client and create/update SA models

The client part of webapp is a jQuery-based framework. The main concepts are:
 - Controller, which is a JS class which registers some _routes_, much like Django or Pylons do
 - route is a mapping of URL's "hash slack", i.e. the anchor part which comes after #, to a View.
 - a View is a JS object which displays data on the page. Generally a view is associated to some <div /> on the page.
 - Application object, which monitors the changes in the hash slack and notifies Controller, which shows/hides views 
   according to its registered routes

