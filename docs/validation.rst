###############
Form validation
###############

Here's the list of validators defined by validatish:


.. automodule:: validatish.validator
   :members:

To provide some isolation and a single location to import the validators from,
"supported" validators are imported into webapp.validators. Additional custom
validators not originally supported by validatish are also defined there.

The callling code is supposed to import webapp.validators instead of validatish

The documentation for the client-side validation plugin is here:
http://docs.jquery.com/Plugins/Validation

There is some "bridging" code which reads validation rules set for a schemaish
structure and generates a bit of JavaScript which configures the jquery plugin.

The following validators are currently automatically "bridged":

- v.Required

- v.Email

- v.URL

- v.Number

- v.DomainName (there's a custom validator on the JS side for that, defined in webapp.js)


Some Tricks
===========

Compound validator v.All is working:

    required_number = sc.String(title="Required Number", validator=v.All(v.Number(), v.Required()))

v.Any does not work currently.


