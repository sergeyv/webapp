# -*- coding: utf-8 -*-
##########################################
#     This file forms part of WEBAPP
#     Copyright: refer to COPYRIGHT.txt
#     License: refer to LICENSE.txt
##########################################

### MONKEYPATCH
### WebOb 1.2 does not include UnicodeMultiDict, which breaks formish and FormAlchemy
import webob.multidict
webob.multidict.UnicodeMultiDict = webob.multidict.MultiDict


from db import Base, initialize_sql, get_session, set_dbsession, get_session_class

from app_root import IRootCollection, RootCollection

from theme import set_theme, get_theme
from theme import AssetRegistry

from .forms import AutoSchema, Literal
from .forms import FormRegistry, LoadableForm, loadable


from .defaults import *

from rest import RestCollection, RestResource, RestSubobject, IRestRootCollection



#from .forms.data_format import DataFormat
