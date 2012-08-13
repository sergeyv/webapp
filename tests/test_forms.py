# # -*- coding: utf-8 -*-

# from datetime import datetime

# import schemaish as sc

# import crud
# import webapp
# from webapp.forms.data_format import DataFormatReader

# from nose.tools import raises
# from pyramid import testing

# from . import Organisation, School

# session = None

# rr = crud.ResourceRegistry("forms")
# fr = webapp.FormRegistry("forms")


# # # forms
# # @fr.loadable
# # class GenericForm(sc.Structure):

# #     __allow_loadable__ = True

# #     id = sc.Integer()
# #     name = sc.String()
# #     established = sc.DateTime()


# # @fr.loadable
# # class SpecificForm(sc.Structure):

# #     __allow_loadable__ = True

# #     id = sc.Integer()
# #     name = sc.String()
# #     established = sc.DateTime()
# #     is_school = sc.Boolean()


# # @rr.add(Organisation)
# # class OrganisationResource(webapp.RestResource):

# #     data_formats = {
# #         'generic': 'GenericForm',
# #         }


# # @rr.add(School)
# # class SchoolResource(webapp.RestResource):

# #     data_formats = {
# #         'specific': 'SpecificForm',
# #         }


# # def setUp():
# #     global session
# #     session = webapp.get_session()
# #     webapp.Base.metadata.create_all()


# # def tearDown():
# #     session.rollback()
# #     session.close()
# #     webapp.Base.metadata.drop_all()


# # def _get_reader(resource, structure):
# #     reader = DataFormatReader(structure)
# #     reader.__parent__ = resource
# #     return reader


# # def _make_request():
# #     return testing.DummyRequest()


# # @raises(ValueError)
# # def test_inheritance():
# #     """
# #     if a resource provides no form, webapp USED TO look up the object's parents to see
# #     if they define the form. So we COULD declare a form in a parent class
# #     and use it to serialize children.

# #     This feature has since been disabled, so we just make sure the test
# #     raises ValueError
# #     """

# #     est = datetime.utcnow()
# #     s = School(id=123, name="TEST!", established=est)
# #     r = SchoolResource("123", None, s)

# #     data = _get_reader(r, GenericForm).serialize(_make_request())

# #     assert data['id'] == 123
# #     assert data['name'] == "TEST!"
# #     assert data['established'] == est

# #     data = _get_reader(r, SpecificForm).serialize(_make_request())

# #     assert data['id'] == 123
# #     assert data['name'] == "TEST!"
# #     assert data['established'] == est



