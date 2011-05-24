(function ($) {

    function convert_id_to_name(s, formid) {
        var segments = s.split('-'),
            start_segment = 1;
        if (formid === '') {
            start_segment = 0;
        }
        return segments.slice(start_segment, segments.length).join('.');
    }

    function get_sequence_numbers(segments, l) {
        var result = [],
            i;
        for (i = 0; i < segments.length; i += 1) {
            if (!isNaN(parseInt(segments[i], 10))) {
                result.push(segments[i]);
            }
        }
        result.push(l);
        return result;
    }

    function replace_stars(original, nums, divider) {

        var result = [],
            segments = original.split(divider),
            n = 0,
            i,
            segment;

        for (i = 0; i < segments.length; i += 1) {
            segment = segments[i];
            if ((segment === '*' || !isNaN(parseInt(segment, 10))) && n < nums.length) {
                // If the segment is a * or a number then we check replace it with the right number (the target number is probably right anyway)
                result.push(nums[n]);
                n = n + 1;
            } else {
                // If not then we just push the segment
                result.push(segment);
            }
        }
        return result.join(divider);
    }

    function construct(start_segments, n, remainder, divider, strip) {
        // Takes a set of prefix segments, a number and the remainder plus a flag whether to strip(?)
        var remainder_bits = remainder.split(divider),
            result = [],
            i,
            segment;
        remainder = remainder_bits.slice(1, remainder_bits.length - strip).join(divider);

        for (i = 0; i < start_segments.length; i += 1) {
            segment = start_segments[i];
            if (segment !== '') {
                result.push(segment);
            }
        }
        result.push(n);
        if (remainder !== '') {
            return result.join(divider) + divider + remainder;
        } else {
            return result.join(divider);
        }
    }


    var settings = {},
        methods;

    methods = {
        init: function (options) {

            return this.each(function () {
                var $view = $(this);

                if (options) {
                    $.extend(settings, options);
                }

                $view.formish('add_sortables')
                    .formish('create_addlinks')
                    .formish('add_mousedown_to_addlinks')
                    .formish('add_remove_buttons');
            });
        },

        add_sortables: function () {
            var o = this,
                order_changed = function () { // takes e and ui parameters but doesn't use them
                    o.formish('renumber_sequences');
                };

            o.find('.sortable .handle').remove();
            o.find('.sortable .seqgrab').after('<div class="handle">drag me</div>');
            o.find('.sortable').sortable({items: '> .field', stop: order_changed, handle: '.handle'});
            return this;
        },

        create_addlinks: function () {
            var o = this;
            o.find('.adder').each(function () {
                $(this).before('<a class="adderlink">Add</a>');
            });
            return this;
        },

        add_mousedown_to_addlinks: function () {
            var o = this;
            o.each(function () {
                var form = $(this);
                form.find('.adderlink').mousedown(function () { form.formish('add_new_items', $(this)); });
            });
            return this;
        },

        add_new_item: function (t) {
            var o = this,
                formid = o.attr('id'),
                code = t.next('.adder').val(),// Get the encoded template
                l = t.next('.adder').prevAll('.field').length, // Find out how many fields we already have
                originalname = t.next('.adder').attr('name'), // Get some variable to help with replacing (originalname, originalid, name, id)
                /* doesn't seem to be used
                new_originalname = t.closest('.type-container').attr('id');
                new_originalname = new_originalname.substr(0,new_originalname.length-6);
                new_originalname = convert_id_to_name(new_originalname,formid);
                */
                segments = originalname.split('.'),
                seqnums = get_sequence_numbers(segments, l), // Get the numbers used in the originalname
                //originalid = formid + '-' + segments.join('-'),
                name,
                id,
                html = decodeURIComponent(code),// Decode the template.
                h = $(html),
                newid;
            segments[segments.length - 1] = l;
            name = segments.join('.');
            id = formid + '-' + segments.join('-');

            // Add the links and mousedowns to this generated code
            h.formish('create_addlinks').formish('add_mousedown_to_addlinks');

            h.find("[name]").each(function () {
                var newname = replace_stars($(this).attr('name'), seqnums, '.');
                $(this).attr('name', newname);
            });

            newid = replace_stars(h.attr('id'), seqnums, '-');

            h.attr('id', newid);
            h.find("[id]").each(function () {
                var newid = replace_stars($(this).attr('id'), seqnums, '-');
                $(this).attr('id', newid);
            });
            h.find("[for]").each(function () {
                var newid = replace_stars($(this).attr('for'), seqnums, '-');
                $(this).attr('for', newid);
                if ($(this).text() === '*') {
                    $(this).text(l);
                }
            });
            h.find("label[for='" + id + "']").text(l);
            h.find("legend:contains('*')").text(l);

            t.before(h);
            t.parent().parent().formish('add_remove_buttons');
            $('form').formish('add_sortables');
        },

        add_new_items: function (t) {
            var o = this,
                i,
                terms,
                key,
                value,
                data = t.closest('.field').find('.formish-sequencedata').attr('title').split(',');

            for (i = 0; i < data.length; i += 1) {
                terms = data[i].split('=');
                key = terms[0];
                if (key === 'batch_add_count') {
                    value = terms[1];
                    break;
                }
            }
            for (i = 0; i < value; i += 1) {
                o.formish('add_new_item', t);
            }
        },


        renumber_sequences: function () {
            var o = this;
            o.each(function () {
                $(this).formish('renumber_sequence');
            });
        },

        renumber_sequence: function () {
            var o = this,
                formid = $(o).attr('id'),
                N = {};

            o.find('.type-sequence.widget-sequencedefault').each(function () {
                var type_container = $(this).hasClass('type-container') ? 0 : 1,
                    seqid = $(this).attr('id'),
                    seqid_prefix = seqid.substr(0, seqid.length - 6);

                // replace id occurences
                $(this).find('.field').each(function () {
                    var thisid = $(this).attr('id'),
                        n,
                        newid;
                    if (seqid.split('-').length + 1 === thisid.split('-').length) {
                        if (N[seqid_prefix] === undefined) {
                            N[seqid_prefix] = 0;
                        } else {
                            N[seqid_prefix] = N[seqid_prefix] + 1;
                        }
                        n = N[seqid_prefix];
                        newid = seqid_prefix + n + '--field';
                        $(this).attr('id', newid);
                        // Replace 'for' occurences
                        $(this).find("[for^='" + seqid_prefix + "']").each(function () {
                            var name = $(this).attr('for'),
                                name_remainder = name.substring(seqid_prefix.length, name.length);
                            $(this).attr('for', construct(seqid_prefix.split('-'), n, name_remainder, '-', type_container));
                        });
                        // Replace 'id' occurences
                        $(this).find("[id^='" + seqid_prefix + "']").each(function () {
                            var name = $(this).attr('id'),
                                name_remainder = name.substring(seqid_prefix.length, name.length);
                            $(this).attr('id', construct(seqid_prefix.split('-'), n, name_remainder, '-', type_container));
                        });
                        // replace 'name' occurences
                        $(this).find("[name^='" + convert_id_to_name(seqid_prefix, formid) + "']").each(function () {
                            var name = $(this).attr('name'),
                                name_remainder = name.substring(convert_id_to_name(seqid_prefix, formid).length, name.length);
                            $(this).attr('name', construct(convert_id_to_name(seqid_prefix, formid).split('.'), n, name_remainder, '.', type_container));
                        });
                    }
                });
            });
        },

        add_remove_buttons: function () {
            var o = this;
            o.find('.remove').remove();
            o.find('.seqdelete').each(function () {
                var x;
                if ($(this).next().text() !== 'delete') {
                    x = $('<span class="remove">delete</span>');
                    $(this).after(x);
                    x.mousedown(function () {
                        $(this).closest('.field').remove();
                        o.formish('renumber_sequences').formish('add_sortables');
                    });
                }
            });
        },

        dummy: {} // something to not to worry about adding/removing commas

    };

    $.fn.formish = function (method) {

        if (methods[method]) {
            return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
        } else if (typeof method === 'object' || !method) {
            return methods.init.apply(this, arguments);
        } else {
            $.error('Method ' +  method + ' does not exist on jQuery.formish');
        }
    };
}(jQuery));
