(function ($, webapp) {
    "use strict";

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

    Controller.prototype.getViewById = function (id) {
        var i,
            mapping;

        for (i = 0; i < webapp.routeMappings.length; i += 1) {
            mapping = webapp.routeMappings[i];
            if (mapping.view &&  mapping.view.options && mapping.view.options.identifier === id) {
                return mapping.view;
            }
        }
    };

    Controller.prototype.showMainView = function (view, event) {
        /*
        Shows the view as the "main" view, i.e. inserted in the main
        container on the page and reflecting the state of the current URI
        */

        view.controller = this;


        // notify the current view - allows the view to do some processing on hiding
        if (this.currentView && this.currentView.aboutToBeHidden) {
            this.currentView.aboutToBeHidden();
        }

        /*
        if the view has no uri_args speicified (as when we're going to
        the URL by clicking on a tab - we preserve the previous uri_args
        which shows the page as it was when we left it the last time.

        This only makes sense for the listing and is
        controlled by preserve_uri_args option
        */
        var old_event = view.event||{uri_args:{}};
        if ($.isEmptyObject(event.uri_args) &&
            old_event.hash &&
            old_event.hash != event.hash &&
            view.options.preserve_uri_args) {
            //event.uri_args = old_event.uri_args;
            if (old_event.hash != event.hash) {
                return webapp.relocateTo(old_event.hash);
            }
        }

        view.event = event;
        // Store the given view as the current view.
        this.currentView = view;

        view.show();

        // reflect the change in the navigation
        this.updateMenu(event);
    };


    Controller.prototype.showSecondaryView = function (view, event) {

        var self = this;
        // event.display_mode = mode;
        view.event = event;
        view.event.parentView = self.currentView;
        self.currentView = view;

        view.show();

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

    Controller.prototype.setActiveView = function (view) {

        var old_views,
            self = this;

        /// if the view is shown in a popup, we don't need
        /// to hide the previous view etc.
        if (view.event.display_mode === "popup") {
            view.view.dialog({
                modal: true,
                width: "80%",
                /* find the title directly on the page, remove it from there*/
                title: view.view.find('.primaryPageHeading').detach().text(),
                close: function () {
                    /* Restore the parent view as the currentView */
                    if ( view.event.parentView )
                        self.currentView = view.event.parentView;
                }

            });

            // view.event.parentView = self.currentView;
            // self.currentView = view;

        } else if (view.event.display_mode === "modal") {

            var $modal =
            $('<div class="modal hide" tabindex="-1" role="dialog" >' +
            '  <div class="modal-header">' +
            '    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">×</button>' +
            '  </div>' +
            '  <div class="modal-body"></div>' +
            '  <!--div class="modal-footer"></div-->' +
            '</div>');

            view.view.detach().appendTo($modal.find(".modal-body"));
            $modal.find('.modal-header').append(view.view.find('.primaryPageHeading'));
            /* this would move the buttons to a separate footer section
               although keeping them as is both makes them look more consistent
               and they work without extra fuss
            */
            $modal.find('.modal-footer').append(view.view.find('.actions'));
            $modal.data('view_in_modal', view);

            $modal.on('hidden', function () {
                /* revert controller.currentView to the previous view. This is the right place to do this
                   because the modal can be dismissed by a variety of ways
                */
                self.currentView = $modal.data('view_in_modal').event.parentView;
            });

            $modal.modal({
                show: true
            });

            // view.event.parentView = self.currentView;
            // self.currentView = view;

        } else if (view.event.display_mode === "popover") {

            view.event.initiating_element.instant_popover({
                title: view.view.find('.primaryPageHeading').detach().text(),
                content: view.view,
                placement: 'bottom'
            });

        } else if (view.event.display_mode === "inline") {
            $(view.event.inline_container_selector).require_one().html(view.view);
        } else {
            /* show as main view */
            old_views = $(".activeContentView");
            $.each(old_views, function (idx, elem) {
                var $elem = $(elem);
                if ($elem.attr('id') !== view.view.attr('id')) {
                    if ($elem.hasClass('preserve')) {
                        $elem.removeClass("activeContentView");
                    } else {
                        $elem.remove();
                    }
                }
            });
        }

        view.view.addClass("activeContentView");

        // a view can define a callback to be called after the view is shown
        if (view.options.after_view_shown) {
            view.options.after_view_shown.apply(view);
        }

        // a global callback
        if (webapp.after_view_fully_loaded) {
            webapp.after_view_fully_loaded(view);
        }

        if (view.renderFlashMessages) {
            view.renderFlashMessages();
        }
    };

    webapp.controller = new Controller();

}(jQuery, webapp));
