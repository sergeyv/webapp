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

            self.$select = $(this._make_select()).insertAfter(this.$element);

            self.$datepicker = $(this._make_datepicker())
                .insertAfter(this.$select);
                /*.hide();*/


            self.$datepicker.datepicker()
                .on('changeDate', function (ev) {
                    self.$datepicker.find('span').require_one().html(self.$datepicker.data('date'));
                    self.$datepicker.datepicker('hide');
                });


            /*this.$datepicker.find('a.hideWidget').require_one().click(function () {
                self._hide_datepicker();
                return false;
            });*/

            self.$add_time_link = $('<button class="btn btn-small"><i class="icon-time"></i></button>')
                .insertAfter(this.$datepicker)
                .click(function () {
                    self._show_time();
                    return false;
                });

            self.$time_widget = $(this._make_time_widget())
                .insertAfter(this.$add_time_link)
                .hide();

            self.$time_widget.find('a.hideWidget').require_one().click(function () {
                self._hide_time();
                return false;
            });

            self.$select.change(function () {
                self._select_changed();
                return false;
            });
        },

        yourOtherFunction: function(el, options) {
            // some logic
        },

        _make_select: function() {
            var out = [],
                select_values = [
                    {val: '', name: '&mdash;'},
                    {val: 'today', name: 'Today'},
                    {val: 'tomorrow', name: 'Tomorrow'},
                    {val: 'this_week', name: 'This week'},
                    {val: 'next_week', name: 'Next week'} /*,
                    {val: 'specific', name: 'Specific date'}*/
                ];

            /*out.push('<select id="' + this.base_id + '-select">');
            $.each(select_values, function(idx, obj) {
                out.push('<option value="' + obj.val + '">' + obj.name + '</option>');
            });
            out.push("</select>");*/

            out.push('<div class="btn-group" data-toggle="buttons-radio">');
            $.each(select_values, function(idx, obj) {
                out.push('<button type="button" class="btn btn-small">' + obj.name + '</button>');
            });

            out.push('<button type="button" class="btn btn-small" data-date-format="yyyy-mm-dd" data-date="2012-02-20"><i class="icon-calendar"></i> <span></span></button>');

            out.push('<button type="button" class="btn btn-small"><i class="icon-time"></i></button>');
            out.push("</div>");

            return out.join("");
        },

        _make_time_widget: function() {
            var out = [
                '<div class="timeSelects">'
            ], i;

            out.push('<select id="' + this.base_id + '-hours" style="width: 50px;">');
            for (i = 1; i <=12; i++) {
                out.push('<option value="' + i + '">' + i + '</option>');
            }
            out.push('</select>');

            out.push('<select id="' + this.base_id + '-minutes" style="width: 50px;">');
            out.push('<option value="00">00</option>');
            out.push('<option value="15">15</option>');
            out.push('<option value="30">30</option>');
            out.push('<option value="45">45</option>');
            out.push('</select>');

            out.push('<select id="' + this.base_id + '-ampm" style="width: 50px;">');
            out.push('<option value="am" style="color:red">am</option>');
            out.push('<option value="pm">pm</option>');
            out.push('</select>');

            out.push('<a class="btn btn-mini hideWidget" href="#" title="remove time"><i class="icon-remove"></i></a>');

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

        _select_changed: function () {
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
        },

        _show_datepicker: function () {
            /*this.$datepicker.show();
            this.$select.hide();*/
        },

        _hide_datepicker: function () {
            /*this.$datepicker.hide();
            this.$select.show();
            this.$select.val('').change(); */// switch back to "no date set"
        },

        _show_time: function () {
            this.$time_widget.show();
            this.$add_time_link.hide();
        },

        _hide_time: function () {
            this.$time_widget.hide();
            this.$add_time_link.show();
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