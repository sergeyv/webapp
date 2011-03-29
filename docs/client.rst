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

Basically, the only JS file in your application will be ``controller.js``:

.. code-block:: javascript


    webapp.addController((function( $, webapp ){

        function Controller(){
            this.currentView = null;
        };

        Controller.prototype = new webapp.Controller();

        Controller.prototype.init = function(){
            var self = this;
            this.$menu = $("#top-tabs");

            this.route( "/users/", new webapp.Listing({
                    identifier: "users-listing",
                    rest_service_root: "/rest/users/",
                }));

            this.route( "/users/add", new webapp.Form({
                    add_button_title: "Add User",
                    identifier: "UserAddForm",
                    rest_service_root: "/rest/users/:item_id",
                }));

            this.route( "/users/:item_id", new webapp.Template({
                    identifier: "user-view",
                    rest_service_root: "/rest/users/:item_id",
                }) );

            webapp.renderMenu(
                "#top-tabs",
                [
                    {title:'Home', path:'', id: 'default'},
                    {title:'Users'},
                ]
            )
        };

        // Return a new contoller singleton instance.
        return( new Controller() );

    })( jQuery, webapp ));


Here it configures an application which will display a listing of Users at
``http://mysite.com/#/users``; a user add form at ``http://mysite.com/#/users/add``,
a view page for a User at ``http://mysite.com/#/users/<user_id>`` and an edit page
at ``http://mysite.com/#/users/<user_id>/edit``

There are currently a few types of "views" built in:

View
----

``View`` is linked to some html emelent in the page; when Controller matches
the current URL hash slack to a route which leads to a View, that html
element is shown:

.. code-block:: html

    <div id="content-views">

        <div id="404-view" class="contentView">
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

Form
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
            rest_service_root: "/rest/users/:item_id" // we set up a Rest API at this address by registering an SA model (supposedly called User) with crud
        }));

Now, if we open ``#/users/123/edit``, the form will request json data from
``/rest/users/123``, display the data in the form, and after we click Save
the data will be converted into a JSON structure and POSTed to the same url.

Add form vs. Edit form
......................

Here's how the framework tells if a form is an Edit form, i.e. displaying
the data of an existing item and updating the existing item, or it's an Add form which initially is empty and when submitted a new item will be created.

For an edit form the route should contain ``:item_id`` placeholder. Also, rest_service_root should contain that placeholder too:

.. code-block:: javascript

    this.route( "/users/:item_id/edit", new webapp.Form({
            identifier: "UserEditForm",
            rest_service_root: "/rest/users/:item_id"
        }));

This way, when we open a form at #/users/123/edit, the framework will query
the initial form values from /rest/users/123 and when the form is submitted
it'll PUT data to the same URL.

An Add form has no ``:item_id`` placeholder in its route. When invoked, it queries object's initial data from a url where ``:item_id`` is substituted by 'new', and when submitted it PUTs to that url:

.. code-block:: javascript

    this.route( "/users/add", new webapp.Form({
            identifier: "UserAddForm",
            rest_service_root: "/rest/users/:item_id"
        }));

The form above will GET its initial values from ``/rest/users/new`` and when submitted will PUT the data to the same URL.

On the server side, ``new`` maps to a couple of view functions registered on IRestCollection interface, one function handles GET and another PUT method


webapp.Template
-------------

webapp.Template loads a jqote2 template from ``/t/<view-identifier>.html`` and
uses that template to render json data received from the server.


webapp.Template allows links to have some special classes
which modify their behaviour. This allows to avoid having any 'custom' JS code
in templates:

- ``webappAsyncAction`` - clicking on the link pings the target URL
  without the page being reloaded. The server response is discarded

.. code-block:: html

    <a class="webappAsyncAction"
       href="<%=this.view.getRestServiceUrl() %>/<%=server.id %>/start">
        <img src="kitovu.client/images/start.png" alt="Start" />
    </a>

- ``webappInvokeOnLoad`` - the URL will be pinged when the view is shown

- ``webappConfirmDialog`` - shows a confirmation dialog, only pings the URL
  if the user chooses OK. The link's title tag is used for
  the dialog's message text

- ``webappMethodDelete`` - uses DELETE instead of POST (otherwise it's GET)
  We can add more methods when needed though it's not yet
  clear how to send any data in a POST or PUT request.

- ``webappGoBack`` - after the async action has been invoked,
  redirect to the previous page

  The following code illustrates using the above 3 classes at once - when a link is clicked, a user is presented with a confirmation dialog; if the user clicks OK,
  a DELETE request is sent to the server and the user is sent to the page they
  came from:

.. code-block:: html

    <a href="<%=this.view.getRestServiceUrl() %>"
       class="webappAsyncAction webappMethodDelete webappConfirmDialog webappGoBack"
       title="Do you really want to delete site <%=site.name %>?">Delete</a>

- ``webappOnSuccess-<method_name>`` - invoke a specified method
  of the view object after the call succeeds,
  i.e. webappOnSuccess-populateView will reload
  the data from the server and re-render the template with that data.

.. code-block:: html

    <td> <!-- Delete Item -->
        <a class="webappAsyncAction webappConfirmDialog webappMethodDelete webappOnSuccess-populateView" href="#/clients/<%=client.id %>"
        title="Do you really want to delete this client?">X</a>
    </td>

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

.. code-block:: mako

    <table class="listingTable">
    <thead>
        <th>x</th>
        <th class="sortable id-status">Status</th>
        <th class="sortable id-name">Server Name</th>
        <th class="sortable id-provider_id">Provider</th>
        <th class="sortable id-retailer_id">Retailer</th>
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

*How paging works:* Just add a div with a class 'pager' somewhere in the template:

.. code-block:: html

    <div class="pager"> &nbsp; </div>

TODO: Filtering and search are not currently implemented


Template Helpers
----------------

``webapp`` has ``helpers`` object which can be populated by the application with
methods to simplify building templates. In kitovu, the helpers are defined
in ``kitovu_admin/client/helpers.js``:

.. code-block:: javascript

    /// Helpers
    (function($, webapp) {
        
        var h = webapp.helpers;
        h.simple_value = function(title, value) {
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

    <%=webapp.helpers.name_and_id("Client", item.client, "#/clients/") %>
    
The current list of helpers is as follows:

    * simple_value(title, value) - renders a string value with a header
    
    * name_and_id(title, obj, root) - renders a link to a related object (see example above)
    
    * email_value(title, value) - renders a mailto: link
    
    * uri_value(title, value) - renders a link witha header
    
    * time_ago(date_str) - renders a "about 3 hours ago" auto-updating block. Expects a correct timestamp 
    
    * calendar_date(date_str) - renders a date formatted as "28 Mar 2011"
    
Developers are encouraged to re-use the existing helpers and add new ones.
    
    