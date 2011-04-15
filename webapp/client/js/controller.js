(function ($, webapp) {

    // ----------------------------------------------------------------------- //
    // ----------------------------------------------------------------------- //

    function Controller() {
        this.currentView = null;
    }

    // I am the prototype for the Controller prototype.
    Controller.prototype.route = function (path, view, default_parameters) {
        // We will need to extract the parameters into an array - these will be used
        // to create the event object when the location changes get routed.
        var parameters = [],
            // Extract the parameters and replace with capturing groups at the same
            // time (such that when the pattern is tested, we can map the captured
            // groups to the ordered parameters above.
            pattern = webapp.normalizeHash(path).replace(
                new RegExp("(/):([^/]+)", "gi"),
                function ($0, $1, $2) {
                    // Add the named parameter.
                    parameters.push($2);

                    // Replace with a capturing group. This captured group will be used
                    // to create a named parameter if this route gets matched.
                    return $1 + "([^/]+)";
                }
            );

        // Do not allow to add an undefined view:
        if (!view) {
            webapp.showMessage("Undefined view for path " + path, "Invalid Route");
        }

        // Now that we have our parameters and our test pattern, we can create our
        // route mapping (which will be used by the webapp to match location
        // changes to controllers).
        webapp.routeMappings.push({
            controller: this,
            parameters: parameters,
            test: new RegExp(("^" + pattern + "$"), "i"),
            view : view,
            default_parameters : default_parameters || {}
        });
    };

    Controller.prototype.showView = function (view, event) {

        view.controller = this;


        // notify the current view - allows the view to do some processing on hiding
        if (this.currentView && this.currentView.aboutToBeHidden) {
            this.currentView.aboutToBeHidden();
        }

        view.event = event;

        /// Do the initial view set-up before the first showing.
        /// Allows us, say, to load the view contents on demand
        if (!view.alreadyInitialized && view.showViewFirstTime) {
            view.showViewFirstTime();
            view.alreadyInitialized = true;
        } else {
            // Show the given view.
            view.showView();
        }

        // Store the given view as the current view.
        this.currentView = view;

        // TODO: just logging - delete later
        $.each(event.parameters || [], function (idx, value) {
            webapp.log("PARAMETER: " + idx + "->" + value);
        });

        if (event) {
            $.each(event, function (idx, value) {
                webapp.log("EVENT: " + idx + "->" + value);
            });
        }

        // reflect the change in the navigation
        this.updateMenu(event);
    };

    Controller.prototype.updateMenu = function (event) {

        /// in route options we may provide a hint as to what
        /// menu tab to display: { menu_tab: 'megatab' } - then
        /// the element #<menu_id>-megatab will be displayed
        var tab_name = event.parameters && event.parameters.menu_tab;

        /// A controller can declare this.$menu, which is a jquery
        /// object pointing to a menu. It supposed to have some sub-elements
        /// with ids like #<menu_id>-<tab_id>.
        if (this.$menu && this.$menu.length) {
            /// Hide the current tab
            this.$menu.find("a.current").removeClass("current");

            /// if there's no menu_tab hint, we use the first part of
            /// the view's location, so /clients/123/orders/325 will toggle
            /// #<menu_id>-clients
            // location starts with /, so the first element is an empty string
            /// if event.location was empty (as in case of http://mysite.com/
            /// or http://mysite.com/#/ path) then the tab name is 'default'
            tab_name = tab_name || event.location.split('/')[1] || 'default';

            $("#" + this.$menu.attr('id') + "-" + tab_name).addClass("current");
        }
    };

    Controller.prototype.setActiveView = function ($view) {
        $(".activeContentView").removeClass("activeContentView");
        $view.view.addClass("activeContentView");

        // a local callback
        if ($view.after_view_fully_loaded) {
            $view.after_view_fully_loaded($view);
        }

        // a global callback
        if (webapp.after_view_fully_loaded) {
            webapp.after_view_fully_loaded($view);
        }

    }

    webapp.controller = new Controller();

}(jQuery, webapp));
