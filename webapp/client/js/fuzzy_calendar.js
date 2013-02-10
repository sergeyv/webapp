// the semi-colon before function invocation is a safety net against concatenated
// scripts and/or other plugins which may not be closed properly.
;(function ( $, window, document, undefined ) {

    // undefined is used here as the undefined global variable in ECMAScript 3 is
    // mutable (ie. it can be changed by someone else). undefined isn't really being
    // passed in so we can ensure the value of it is truly undefined. In ES5, undefined
    // can no longer be modified.

    // window and document are passed through as local variable rather than global
    // as this (slightly) quickens the resolution process and can be more efficiently
    // minified (especially when both are regularly referenced in your plugin).

    // Create the defaults once
    var pluginName = "fuzzy_calendar",
        defaults = {
            propertyName: "value"
        };

    // The actual plugin constructor
    function FuzzyCalendar(element, options) {
        this.$element = $(element);

        this.base_id = this.$element.attr('id');
        this.dates = {};

        // jQuery has an extend method which merges the contents of two or
        // more objects, storing the result in the first object. The first object
        // is generally empty as we don't want to alter the default options for
        // future instances of the plugin
        this.options = $.extend( {}, defaults, options );

        this._defaults = defaults;
        this._name = pluginName;


        this.button_names = [
            {id: 'later', name: '&mdash;'},
            {id: 'today', name: 'Today'},
            {id: 'tomorrow', name: 'Tomorrow'},
            {id: 'this_week', name: 'This week'},
            {id: 'next_week', name: 'Next week'}
        ];



        this.init();
    }

    FuzzyCalendar.prototype = {

        init: function() {
            // Place initialization logic here
            // You already have access to the DOM element and
            // the options via the instance, e.g. this.element
            // and this.options
            // you can add more functions like the one below and
            // call them like so: this.yourOtherFunction(this.element, this.options).

            var self = this;
                now = new Date();

            self.dates.now = now;
            self.dates.today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            self.dates.tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            self.dates.this_week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 6);
            self.dates.next_week = this.dates.this_week;
            self.dates.next_week.setDate(this.dates.next_week.getDate() + 7);

            self.$element.hide();

            self.$widget = $(this._make_widget()).insertAfter(this.$element);

            /*self.$datepicker = $(this._make_datepicker())
                .insertAfter(this.$select);*/
                /*.hide();*/



            self.$datepicker_btn = self.$widget.find('button.datepickerBtn').require_one();
            /* selecting a date from the calendar */
            self.$datepicker_btn.datepicker()
                .on('changeDate', function (ev) {
                    self.$datepicker_btn.find('span').require_one().html(self.$datepicker_btn.data('date'));
                    self.$datepicker_btn.datepicker('hide');

                    // depress the button
                    self.$widget.find("button").removeClass('active');
                    self.$datepicker_btn.addClass('active');
                    self._show_time();

                });

            $.each(self.button_names, function(idx, obj) {
                self['$' + obj.id + '_btn'] = $('#' + self.base_id + '-' + obj.id).require_one();
            });

            self.$timepicker_btn = self.$widget.find('button.timepickerBtn').require_one();
            self.$timepicker_btn.dropdown();
            self.$timepicker_btn.click(function () {
                self.$timepicker_btn.dropdown('toggle');

            });

            self.$hours_select = $('#' + this.base_id + '-hours').require_one();
            self.$minutes_select = $('#' + this.base_id + '-minutes').require_one();
            self.$ampm_select = $('#' + this.base_id + '-ampm').require_one();


            /* timepicker button click */
            self.$set_time_btn = self.$widget.find('button.setTime')
                .require_one()
                .click(function () {
                    var label = self.$hours_select.val() +
                        ':' +
                        self.$minutes_select.val() +
                        ' ' +
                        self.$ampm_select.val();

                    self.$timepicker_btn.find('span').require_one().html(label);
                    self.$datepicker_btn.datepicker('hide');
                });

            // Fix input element click problem
            $('.dropdown-menu select').click(function(e) {
                e.stopPropagation();
            });


            /* today - tomorrow - this week etc. buttons */
            self.$widget.find("button.fuzzyDateBtn")
                .require_exactly(5)
                .click(function () {
                    var $btn = $(this),
                        val = $btn.data('value');
                    console.log(val);
                    if (val == 'later' || val == 'this_week' || val == 'next_week') {
                        self._hide_time();
                    } else {
                        self._show_time();
                    }
                    self._clear_datepicker();
                });


        },

        yourOtherFunction: function(el, options) {
            // some logic
        },

        _make_widget: function() {
            var out = [],
                self = this;

            out.push('<div class="btn-toolbar">');
            out.push('<div class="btn-group" data-toggle="buttons-radio">');
            $.each(self.button_names, function(idx, obj) {
                out.push('<button id="' + self.base_id + '-' + obj.id + '" data-value="' + obj.id + '" type="button" class="btn btn-small fuzzyDateBtn">' + obj.name + '</button>');
            });

            out.push('<button type="button" class="btn btn-small datepickerBtn" data-date-format="yyyy-mm-dd" data-date="2012-02-20"><i class="icon-calendar"></i> <span></span></button>');
            out.push('</div>');

            out.push('<div class="btn-group">');
            out.push('<button type="button" class="btn btn-small timepickerBtn" data-toggle="dropdown"><i class="icon-time"></i> <span></span></button>');

            /* time dropdown */
            out.push('<div class="dropdown-menu">');
            out.push(this._make_time_widget());
            out.push('</div>');
            /* end time dropdown */

            out.push('</div>');
            out.push("</div>");

            return out.join("");
        },

        _make_time_widget: function() {
            var out = [
                '<div class="timeSelects" style="padding:1em">'
            ], i;

            out.push('<select id="' + this.base_id + '-hours" style="width: 4em">');
            for (i = 1; i <=12; i++) {
                out.push('<option value="' + i + '">' + i + '</option>');
            }
            out.push('</select>');

            out.push(':');

            out.push('<select id="' + this.base_id + '-minutes" style="width: 4em">');
            out.push('<option value="00">00</option>');
            out.push('<option value="15">15</option>');
            out.push('<option value="30">30</option>');
            out.push('<option value="45">45</option>');
            out.push('</select>');

            out.push('<select id="' + this.base_id + '-ampm" style="width: 4em">');
            out.push('<option value="am">am</option>');
            out.push('<option value="pm">pm</option>');
            out.push('</select>');

            out.push('<br><button type="button" class="btn removeTime"><i class="icon-remove"></i></button>');
            out.push('<button type="button" class="btn btn-primary setTime">Set time</button>');

            out.push('</div>');
            return out.join("");
        },

        _make_datepicker: function() {

            return '<button class="btn small" id="datepicker-btn" data-date-format="yyyy-mm-dd" data-date="2012-02-20"><i class="icon-calendar"></i> <span></span></button>';
            /*var out = [
                '<div id="' + this.base_id + '-datepicker">'
            ];

            out.push('<a class="btn btn-mini hideWidget" href="#" title="remove time"><i class="icon-remove"></i></a>');
            out.push('</div>');

            return out.join("");*/
        },

        /*_select_changed: function () {
            var val = this.$select.val();
            this.$element.val(val);
            if (val === 'specific') {
                this._show_datepicker();
            }
            if (val === 'today' || val === 'tomorrow' || val === 'specific') {
                this._hide_time(); // here it actually _shows_ the [Add Time] button
            } else {
                this.$time_widget.hide();
                this.$add_time_link.hide();
            }
        },*/


        _clear_datepicker: function () {
            var self = this;

            self.$datepicker_btn.find('span').require_one().text('');
        },

        _show_time: function () {
            this.$timepicker_btn.show();
        },

        _hide_time: function () {
            this.$timepicker_btn.hide();
        }

    };

    // A really lightweight plugin wrapper around the constructor,
    // preventing against multiple instantiations
    $.fn[pluginName] = function ( options ) {
        return this.each(function () {
            if (!$.data(this, "plugin_" + pluginName)) {
                $.data(this, "plugin_" + pluginName, new FuzzyCalendar( this, options ));
            }
        });
    };

})( jQuery, window, document );