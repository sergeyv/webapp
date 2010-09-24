
    /* Options are:
    identifier
    rest_service_root
    redirect_after_add
    redirect_after_edit
    */
    function GenericForm(options){
        this.options = $.extend({
            add_form_title: "Add Item",
            edit_form_title: "Edit Item",
            add_button_title: "Add Item",
            edit_button_title: "Save Changes"
        }, options);
    };


    GenericForm.prototype.init = function(){
         /// this is called _before_ the view is loaded (as the view is loaded on demand)
         /// so the html stuff is not available yet
         var self = this;
         self.view = $( "#"+self.options.identifier+"-form-container" );
         if (!self.view.length)
         {
            /// Create and append a node if not found
            var $node = ($('<div id="'+self.options.identifier+'-form-container" class="contentView">'))
            .append($('<h1><span class="formTitle">###</span></h1>'))
            .append($('<div class="formPlaceholder"></div>'));

            $("#content-views").append($node);
            self.view = $( "#"+self.options.identifier+"-form-container" );
        }



    };


    GenericForm.prototype.bindFormControls = function() {
        var self = this;
        self.form = $( "#"+self.options.identifier );
        self.controls = {}

        var items = self.form.serializeArray();
        $.each(items, function() {
                self.controls[this.name] = $("#"+self.options.identifier+"-"+this.name);
            });
    };

    GenericForm.prototype.setValidationRules = function() {
        var self = this;
        var rules = window.application.getValidationRules(self.options.identifier)
        self.form.validate( { rules: rules,
            submitHandler: function(form) {
                self.submitForm();
            }
        } );

    };

    GenericForm.prototype.showViewFirstTime = function( parameters ) {
        self = this;
        load_from = "/forms/"+self.options.identifier;

        var $placeholder = self.view.find(".formPlaceholder");
        if (! $placeholder.length) {
            alert("Can't find form placeholder for " + self.options.identifier);
        }
        $placeholder.load(load_from, function() {

            self.genericAugmentForm();

            /// Form is loaded, we can now adjust form's look
            self.augmentForm();

            // and bind stuff
            self.bindFormControls();

            // Set validation
            self.setValidationRules();

            // attach event handlers
            self.setHandlers();

            /// finally we can show the form
            self.showView( parameters );
        });

    };


    GenericForm.prototype.genericAugmentForm = function() {
        /// Do stuff we want on every form
        self = this;

        /// TODO: Add option/condition "add_cancel_link"?
        self.view.find(".actions").append("&nbsp; or &nbsp;<a class=\"formCancelLink\" href=\"#/\">Cancel</a>");

        /// convert the "fake" fields which are marked with
        /// 'section_title' class into titles
        this.view.find(".section_title").each( function () {
            var text = "";
            var t = $(this).children("label");
            var st = $(this).children("span.description");
            if (t.length) { text = "<h2>"+t.html()+"</h2>"; }
            if (st.length) { text += '<p class="description">'+st.html()+'</p>'; }

            $(this).replaceWith(text);
        });

    }

    GenericForm.prototype.augmentForm = function() {
        /*
        Modify the form appearance after it is loaded
        */

        /// do nothing, override in subclasses
    }

    GenericForm.prototype.setHandlers = function() {
        /*
        Attach form handlers which respond to changes in the form_data
        (i.e. to implement dependent controls etc.)
        */

        /// do nothing, override in subclasses
    }


    // I get called when the view needs to be shown.
    GenericForm.prototype.showView = function( parameters ){
        var self = this;

        // Show the view.
        self.view.addClass( "activeContentView" );
        self.item_id = parameters.id;
        /// Change the form's title depending on whether we're adding or editing
        if (self.item_id) {
            self.view.find(".formTitle").text(self.options.edit_form_title);
            self.view.find("#"+self.options.identifier+"-action").val(self.options.edit_button_title);
        } else {
            self.view.find(".formTitle").text(self.options.add_form_title);
            self.view.find("#"+self.options.identifier+"-action").val(self.options.add_button_title);
        }
        /// if it's the first showing, DOM does not exist at this point yet
        self.populateForm(self.item_id);

    };


    // ----------------------------------------------------------------------- //


    // I disable the form.
    GenericForm.prototype.disableForm = function(){
        // Disable the fields.
        /*this.fields.name.attr( "disabled", true );
        this.fields.phone.attr( "disabled", true );
        this.fields.email.attr( "disabled", true );*/
    };


    // I enable the form.
    GenericForm.prototype.enableForm = function(){
        // Enable the fields.
        /*this.fields.name.removeAttr( "disabled" );
        this.fields.phone.removeAttr( "disabled" );
        this.fields.email.removeAttr( "disabled" );*/
    };


    // I get called when the view needs to be hidden.
    GenericForm.prototype.hideView = function(){
        this.view.removeClass( "activeContentView" );
    };


    // I reset the contact form.
    GenericForm.prototype.resetForm = function(){
        // Clear the errors.
        //this.clearErrors();

        // Reset the form fields.
        //this.form.get( 0 ).reset();
    };




    GenericForm.prototype.populateForm = function(item_id) {

        var self = this;
        // Reset the form.
        self.resetForm();

        self.disableForm();
        if (! item_id) { return; }

        /// TODO: format support - +"?format="+self.options.identifier etc.
        $.Read(self.options.rest_service_root+"/"+item_id, function(data) {
            window.application.log("TADA");
            $.each(data, function(name, value) {
                var id = '#' + self.options.identifier + '-' + name;
                var elem = $(id);
                window.application.log(id + " ===> " + elem);
                $(id).val(value);
            });
        });
    };

    // I submit the form.
    GenericForm.prototype.submitForm = function(){
        var self = this;

        //alert("Submit!");

        var form_data = self.form.serializeObject();
        if (! self.item_id)
        {
            /// It's an "Add user" form
            $.Create(self.options.rest_service_root+"/", form_data,
                function(data) {
                    // go back to the users listing (this re-queries the listing from the server)
                    window.application.relocateTo(self.options.redirect_after_add);
                });
        } else {
            /// It's an "Edit user" form
            $.Update(self.options.rest_service_root+"/"+self.item_id, form_data,
                function(data) {
                    // go back to the users listing (this re-queries the listing from the server)
                    window.application.relocateTo(self.options.redirect_after_edit);
                });
        }
        return false;
    };

    /// VOCABULARY STUFF
    /// (not really sure it belongs here)
    GenericForm.prototype.show_add_vocab_value_dialog = function (listbox, url, dialog_title) {
        /// display a dialog to add a value to a vocab (offices, departments etc.)
        listbox.val(0);
        var self = this;
        window.application.dialog.find("input.newValueText").attr("value", "");

        var close_fn = function() { $(this).dialog("close"); };
        var add_fn = function() {
            $.Create(url, {'name': window.application.dialog.find("input.newValueText").attr("value")},
                        function(data) {
                            self.populate_listbox(listbox, data, true);
                    });
            window.application.dialog.dialog('close');
            window.application.dialog.find("button.okButton").unbind("click");
        };


        if (!dialog_title) { dialog_title = "Add New Item"; }
        window.application.dialog
            .dialog('option', 'title', dialog_title )
            .dialog('option', 'buttons', { Cancel:  close_fn, Add: add_fn} )
            .dialog('open');
    };


    GenericForm.prototype.populate_listbox = function (listbox, data, addmore)
    {
        listbox.children().remove();
        listbox.append($('<option/>').attr({value:""}).html(" -- please choose -- "));

        for (var i = 0; i< data.items.length; i++) {
            var d = data.items[i];
            listbox.append($('<option/>').attr({value:d[0]}).html(d[1]));
        }

        if (addmore)
        {
            listbox.append($('<option/>').attr({value:"ADD"}).html("... add another one"));
        }

        /// select the newly-added value or the first one if empty
        var new_id = data.new_id || 0;
        listbox.val(new_id);
    };

    GenericForm.prototype.refresh_listbox_vocab = function (url, listbox, addmore)
    {
        var self = this;
        /// query an id-value list form the server and populate
        /// a listbox
        $.getJSON(url, function(data) {
            self.populate_listbox(listbox, data, addmore);
        });
    }
    /// END VOCABULARY STUFF

