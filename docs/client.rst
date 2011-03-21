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


    window.application.addController((function( $, application ){

        function Controller(){
            this.currentView = null;
        };

        Controller.prototype = new application.Controller();

        Controller.prototype.init = function(){
            var self = this;
            this.$menu = $("#top-tabs");

            this.route( "/users/", new GenericListing({
                    identifier: "users-listing",
                    rest_service_root: "/rest/users/",
                }));

            this.route( "/users/add", new GenericForm({
                    add_button_title: "Add User",
                    identifier: "UserAddForm",
                    rest_service_root: "/rest/users/:item_id",
                }), {adding:true} );

            this.route( "/users/:item_id", new TemplatedView({
                    identifier: "user-view",
                    rest_service_root: "/rest/users/:item_id",
                }) );

            application.renderMenu(
                "#top-tabs",
                [
                    {title:'Home', path:'', id: 'default'},
                    {title:'Users'},
                ]
            )
        };

        // Return a new contoller singleton instance.
        return( new Controller() );

    })( jQuery, window.application ));


Here it configures an application which will display a listing of Users at
``http://mysite.com/#/users``; a user add form at ``http://mysite.com/#/users/add``,
a view page for a User at ``http://mysite.com/#/users/<user_id>`` and an edit page
at ``http://mysite.com/#/users/<user_id>/edit``

There are currently a few types of "views" built in:

GenericView
-----------

GenericView is linked to some html emelent in the page; when Controller matches
the current URL hash slack to a route which leads to a GenericView, that html
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
GenericView too.

GenericForm
-----------

A GenericForm uses server-generated forms to represent data to the user - the
form is a ``schemaish`` structure defined in Python code::

    @webapp.loadable
    class UserEditForm(sc.Structure):
        first_name = sc.String()
        last_name = sc.String()
        date_of_birth = sc.String()

Then we can use it by attaching a GenericForm to some route:

.. code-block:: javascript

    this.route( "/users/:item_id/edit", new GenericForm({
            add_button_title: "Add User",
            identifier: "UserEditForm", // the same as the name of the class in Python
            rest_service_root: "/rest/users/:item_id" // we set up a Rest API at this address by registering an SA model (supposedly called User) with crud
        }), {adding:true} );

Now, if we open ``#/users/123/edit``, the form will request json data from
``/rest/users/123``, display the data in the form, and after we click Save
the data will be converted into a JSON structure and POSTed to the same url.

TemplatedView
-------------

TemplatedView loads a jqote2 template from ``/t/<view-identifier>.html`` and
uses that template to render json data received from the server.


TemplatedView allows links to have some special classes
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

GenericListing
--------------

GenericListing is based on TemplatedView but has additional features allowing
it to display listings of items (which is also possible to do with TemplatedView,
but GenericListing allows the tables to be sorted/batched/filtered).

.. code-block:: javascript

    this.route( "/servers/", new GenericListing({
        identifier: "servers-listing",
        rest_service_root: "/rest/servers/",
        data_format: 'listing', // optional, if missing 'listing' will be used
        batch_size: 42, //optional, if missing a default value will be used
    }));

*How sorting works:* GenericListing expects a table.listingTable to be present
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