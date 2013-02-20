Client-side framework
=====================

The client part of webapp is a jQuery-based framework. The main concepts are:

- Controller, which is a JS class which registers some _routes_, much like
  Django or Pylons do

- route is a mapping of URL's "hash slack", i.e. the anchor part which comes
  after #, to a View.

- a View is a JS object which displays data on the page. Generally a
  view is associated to some <div /> on the page.

- Application object, which monitors the changes in the hash slack and
  notifies Controller, which shows/hides views
  according to its registered routes.

Basically, the only JS file in your application will be ``routes.js``:

.. code-block:: javascript


    (function ($, webapp) {

        var c = webapp.getController();

        /* PROVIDERS */
        c.route("/providers/", new webapp.Listing({
            identifier: "providers-listing",
            rest_service_root: "/rest/providers/"
        }));


        c.route("/providers/add", new webapp.Form({
            add_button_title: "Add Provider",
            identifier: "ProviderAddForm",
            rest_service_root: "/rest/providers/:item_id"
        }));

        c.route("/providers/:item_id", new webapp.Template({
            identifier: "provider-view",
            rest_service_root: "/rest/providers/:item_id",
            ann: true
        }));

        c.route("/providers/:item_id/edit", new webapp.Form({
            edit_form_title: "Edit Provider",
            identifier: "ProviderEditForm",
            rest_service_root: "/rest/providers/:item_id"
        }));

        /// we need to run this after the DOM is loaded
        $(function () {
            webapp.renderMenu(
                "#top-tabs",
                [
                    {title: 'Home', path: '', id: 'default'},
                    {title: 'Providers'},
                ]
            );

            c.$menu = $("#top-tabs");
        });

    }(jQuery, webapp));


Here it configures an application which will display a listing of Providers at
``http://mysite.com/#/providers``; a user add form at ``http://mysite.com/#/providers/add``,
a view page for a Provider at ``http://mysite.com/#/providers/<provider_id>`` and an edit page
at ``http://mysite.com/#/providers/<provider_id>/edit``

There are currently a few types of "views" built in:

webapp.View
-----------

``View`` is linked to some html emelent in the page; when Controller matches
the current URL hash slack to a route which leads to a View, that html
element is shown:

.. code-block:: html

    <div id="content-views">

        <div id="http404-view" class="contentView">
            <h1>404 - Page Not Found</h1>
            <p>Sorry, but the page you requested could not be found.</p>
            <p>Try going back to the <a href="#/">home page</a>.</p>
        </div>

        <div id="home-view" class="contentView">
            <h1>Hello World!</h1>
            <p>Welcome to our website!</p>
            <p><a href="#/users/">Users</a></p>
        </div>
    </div>

A "404 view" is a built-in view so there's no need to configure a route for it,
yet there should be a div inside contect-views for it. But yes, 404 view is a
View too.

webapp.Form
-----------

A Form uses server-generated forms to represent data to the user - the
form is a ``schemaish`` structure defined in Python code::

    @webapp.loadable
    class UserEditForm(sc.Structure):
        first_name = sc.String()
        last_name = sc.String()
        date_of_birth = sc.String()

Then we can use it by attaching a webapp.Form to some route:

.. code-block:: javascript

    this.route( "/users/:item_id/edit", new webapp.Form({
            add_button_title: "Add User",
            identifier: "UserEditForm", // the same as the name of the class in Python
            rest_service_root: "/rest/users/:item_id", // we set up a Rest API at this address by registering an SA model (supposedly called User) with crud
            next_view: "/users/:item_id"
        }));

Now, if we open ``#/users/123/edit``, the form will request json data from
``/rest/users/123``, display the data in the form, and after we click Save
the data will be converted into a JSON structure and POSTed to the same url.

Add form vs. Edit form
......................

It used to be much more complex, but that's how it works now: the REST backend
defines a /new view on every collection, which represents a "virtual" item -
GETting it would return a dict with empty/default values, and POSTing would create a new item. This way, the client-side forms need not to worry if they
create a new item or update an existing one.

.. code-block:: javascript

    this.route( "/users/:item_id/edit", new webapp.Form({
            identifier: "UserEditForm",
            rest_service_root: "/rest/users/:item_id"
        }));


.. code-block:: javascript

    this.route( "/users/add", new webapp.Form({
            identifier: "UserAddForm",
            rest_service_root: "/rest/users/new"
        }));

The form above will GET its initial values from ``/rest/users/new`` and when submitted will PUT the data to the same URL.

On the server side, ``new`` maps to a couple of view functions registered on IRestCollection interface, one function handles GET and another PUT method

Server-side, the "create" and "update" views return a small json dictionary which
looks like {"item_id": 345} - the data from it is substituted into the form's
``next_view`` parameter, so "/users/:item_id" becomes "/users/345" - this way we can make the form to redirect to the newly-added object. If ``redirect_after_submit`` is missing, the application will redirect to the previous page.

The way the ``next_view`` page is displayed depends on the ``submit_action`` parameter:
the default value is "redirect", which simply redirects to the next page. Alternatively,
it is possible to specify "popup" - this will show the next view in a popup window.
Clicking on any links in the popup view will result in the popup being closed and the
next view displayed the usual way.

webapp.Template
----------------

webapp.Template loads a jqote2 template from ``/t/<view-identifier>.html`` and
uses that template to render json data received from the server.

The path templates are loaded from is controlled by webapp.templates_prefix, the default is "/t/"

webapp.Template allows links to have some special classes
which modify their behaviour. This allows to avoid having any 'custom' JS code
in templates:

- ``webappAsyncAction`` - clicking on the link pings the target URL
  without the page being reloaded. The server response is discarded

.. code-block:: html

    <a class="webappAsyncAction"
       href="<%=this.view.getRestBase() %>/<%=server.id %>/start">
        <img src="/images/start.png" alt="Start" />
    </a>

- ``webappInvokeOnLoad`` - the URL will be pinged when the view is shown

- ``webappConfirmDialog`` - shows a confirmation dialog, only pings the URL
  if the user chooses OK. The link's title tag is used for
  the dialog's message text

- ``webappMethodDelete`` - uses DELETE instead of GET


- ``webappMethodPut`` - uses PUT instead of GET
  If specified alone, the PUT body will be empty - i.e. no data is really sent,
  just an empty request

- ``webappSendData`` - uses jquery.data method to find ``data-send`` attribute on
  link object itself and send it to the server. It makes it possible to send small
  bits of data in the request body. The value of the data-send attribute may be a string representation of a JSON dictionary

.. code-block:: html

    <a class="webappAsyncAction webappMethodPut webappSendData"
       data-send='{one:123, two="hello!"}'
       href="<%=this.view.getRestBase() %>/<%=server.id %>/tasks/add">
        <img src="/images/plus.png" alt="Add two numbers" />
    </a>

The above snippet would send {one: 123, two:'hello!'} to the server

- ``webappGoBack`` - after the async action has been invoked,
  redirect to the previous page

  The following code illustrates using the above 3 classes at once - when a link is clicked, a user is presented with a confirmation dialog; if the user clicks OK,
  a DELETE request is sent to the server and the user is sent to the page they
  came from:

.. code-block:: html

    <a href="<%=this.view.getRestBase() %>"
       class="webappAsyncAction webappMethodDelete webappConfirmDialog webappGoBack"
       title="Do you really want to delete site <%=site.name %>?">Delete</a>

- ``webappOnSuccess-<method_name>`` - invoke a specified method
  of the view object after the call succeeds,
  i.e. webappOnSuccess-reload will reload
  the data from the server and re-render the template with that data.

.. code-block:: html

    <td> <!-- Delete Item -->
        <a class="webappAsyncAction webappConfirmDialog webappMethodDelete webappOnSuccess-reload" href="#/clients/<%=client.id %>"
        title="Do you really want to delete this client?">X</a>
    </td>

- ``webappPopup`` - instead of going to the link, displays it in a popup
  dialog. The address match to one of the views registered in webapp, i.e.,
  it just shows views which are already defined, not pulling pages from
  other sites or something. If ``webappOnSuccess-<method_name>`` class is specified, the method will be invoked after the dialog is closed.


webapp.Listing
--------------

webapp.Listing is based on webapp.Template but has additional features allowing
it to display listings of items (which is also possible to do with webapp.Template,
but webapp.Listing allows the tables to be sorted/batched/filtered).

.. code-block:: javascript

    this.route( "/servers/", new webapp.Listing({
        identifier: "servers-listing",
        rest_service_root: "/rest/servers/",
        data_format: 'listing', // optional, if missing 'listing' will be used
        batch_size: 42, //optional, if missing a default value will be used
    }));

*How sorting works:* webapp.Listing expects a table.listingTable to be present
in the template. The <th> elements inside that table which have 'sortable' and
'id_<fieldname>' classes will be turned into links which modify the hash slack to
force the framework to re-query the data with the new sorting settings and
re-display the view.

.. code-block:: html

    <table class="listingTable">
    <thead>
        <th>x</th>
        <th class="sortable id-status">Status</th>
        <th class="sortable id-name">Server Name</th>
        <th class="sortable id-provider.name">Provider</th>
        <th class="sortable id-retailer.name">Retailer</th>
        <th class="sortable id-type">Server Type</th>
        <th class="sortable id-public_ip">IP Address</th>
        <th class="sortable id-hostname">Hostname</th>
        <th class="sortable id-created_date">Created</th>
        <th>Actions</th>
    </thead>
    <tbody>

    <% for (num in data.items) {
        var item = data.items[num];
    %>
    <tr>
        <!-- render the table body using jquote -->
        <td><%=item.name %></td>
        <!-- etc. -->
    <% } %>
    </table>

*On sorting by a computed attribute*: Sorting by a computed property, while looking like a good idea at first sight, does not look as bright if we give it a bit of thought... to sort by a computed attribute, we'd need to query _all_ objects of a given class from the database - not 10 or 20 displayed on the current page, but all of them, potentially hundreds or thousands. Then, calculating a computed attribute  would potentially involve making more sql queries for _each_ of the thousands of objects. Then we do a sort in Python and discard 99% of our objects, returning only 10 or 20. This can't be fast, and it'll get slower the more data we have in the database.

So I think this feature, while allowing us to solve some problems short-term, may lead to difficulties in the future as the amount of data in the database grows. For that reason, I would object to adding this feature to the framework - if in some particular case this is absolutely unavoidable, a developer can do it manually by overriding Collection's get_items_listing method.

However, there are other alternatives to that:

- Sorting by a *related object's property* is implemented, so <th class="sortable id-client.name">Client</th> will sort by client name - using an efficient JOIN instead of manual sotring.

- for other things, such as... hmm, I'm even having trouble to give you an example... ok, if say we want to sort by a *reverse name*, so "zebrA" comes before "gorillaZ", a solution would be to add another field to the model and populate it with the calculated value::

    def deserialize(self, **kwargs):
        super(AnimalResource, self).deserialize(**kwargs)
        self.model.reversed_name = reversed(item.name) # stores "Arbez" or "Zallirog"

Then, in the template, you can sort by the reversed name:

.. code-block:: html

    <th class="sortable id-reversed_name">Name</th>

*How paging works:* Just add a div with a class 'pager' somewhere in the template:

.. code-block:: html

    <div class="pager"> &nbsp; </div>

TODO: Filtering and search are not currently implemented


Template Helpers
----------------

``webapp`` has a ``helpers`` object which can be populated by the application with
methods to simplify building templates:

.. code-block:: javascript

    /// Helpers
    (function($, webapp) {

        var h = webapp.helpers;
        h.field = function(title, value) {
            /*
             Returns a nicely-formatted bit of html for a view page
            */
            if (value) {
                return "<div><label>"+title+"</label> "+ value + "</div>";
            } else {
                return "";
            }
        };
        ...
    }) (jQuery, webapp);

The helpers then can be used in templates, so instead of tedious

.. code-block:: html

    <% if (item.client.id) { %>
    <div>
        <label>Client:</label>
        <a href="#/clients/<%=item.client.id %>"><%=item.client.name %></a>
    </div>
    <% } %>

we can now use

.. code-block:: html

    <% var h = webapp.helpers; %>
    ...
    <%=h.field("Client", (h.link_to(item.client, "#/clients/")) %>

The current list of helpers is as follows:

    * field(title, value) - renders a string value with a header

    * link_to(title, obj, root) - renders a link to a related object (see example above)

    * email(title, value) - renders a mailto: link

    * uri(title, value) - renders a link witha header

    * time_ago(date_str) - renders a "about 3 hours ago" auto-updating block. Expects a correct timestamp

    * date(date_str) - renders a date formatted as "28 Mar 2011"

Developers are encouraged to re-use the existing helpers and add new ones.


Callbacks
---------

It is possible to define some callbacks to be called before/after a view is shown
 - to modify view html or to run some scripts etc.:

.. code-block:: javascript

    c.route("/domains/:item_id", new webapp.Template({
        identifier: "cDomainView",
        rest_service_root: "/domains/:item_id",
        before_view_shown: function (fragment) {
            this.view.find('pre').linkify();
        }
    }));

The callbacks are:

- `before_view_shown`

- `after_view_shown`
