jQuery(function ($) {
    initSubmitContact();
    initSubmitNewsletter();
});

/* =====================
   Contact Form
===================== */
function initSubmitContact() {

    if (!$('#contact-form').length) {
        return;
    }

    $(document).on('submit', '#contact-form', function (event) {
        event.preventDefault();

        var $form = $(this);
        var $nameInput = $('#name');
        var $emailInput = $('#email');
        var $phoneInput = $('#phone');
        var $subjectInput = $('#subject');
        var $successMessage = $('#success-message');
        var $errorMessage = $('#error-message');

        var isValid = true;

        $form.find('.is-invalid').removeClass('is-invalid');

        /* Name */
        if ($.trim($nameInput.val()) === '') {
            $nameInput.addClass('is-invalid');
            isValid = false;
        }

        /* Email */
        var emailPattern = /^[^ ]+@[^ ]+\.[a-z]{2,3}$/;
        if ($.trim($emailInput.val()) === '' || !emailPattern.test($emailInput.val())) {
            $emailInput.addClass('is-invalid');
            isValid = false;
        }

        /* Phone */
        var phonePattern = /^[\d\s\-\+\(\)]{10,}$/;
        if ($.trim($phoneInput.val()) === '' || !phonePattern.test($phoneInput.val())) {
            $phoneInput.addClass('is-invalid');
            isValid = false;
        }

        /* Subject */
        if ($.trim($subjectInput.val()) === '') {
            $subjectInput.addClass('is-invalid');
            isValid = false;
        }

        if (!isValid) {
            return;
        }

        setTimeout(function () {
            var success = Math.random() > 0.3;

            if (success) {
                $successMessage.removeClass('d-none');
                $errorMessage.addClass('d-none');
                $form[0].reset();
            } else {
                $successMessage.addClass('d-none');
                $errorMessage.removeClass('d-none');
            }

            setTimeout(function () {
                $successMessage.addClass('d-none');
                $errorMessage.addClass('d-none');
            }, 5000);
        }, 1000);
    });
}

/* =====================
   Newsletter Form
===================== */
function initSubmitNewsletter() {

    if (!$('#newsletter-form').length) {
        return;
    }

    $(document).on('submit', '#newsletter-form', function (event) {
        event.preventDefault();

        var $form = $(this);
        var $emailInput = $('#newsletter');
        var $successMessage = $('#success-message-footer');
        var $errorMessage = $('#error-message-footer');

        var isValid = true;

        $emailInput.removeClass('is-invalid');

        var emailPattern = /^[^ ]+@[^ ]+\.[a-z]{2,3}$/;
        if ($.trim($emailInput.val()) === '' || !emailPattern.test($emailInput.val())) {
            $emailInput.addClass('is-invalid');
            isValid = false;
        }

        if (!isValid) {
            return;
        }

        setTimeout(function () {
            var success = Math.random() > 0.3;

            if (success) {
                $successMessage.removeClass('d-none');
                $errorMessage.addClass('d-none');
                $form[0].reset();
            } else {
                $successMessage.addClass('d-none');
                $errorMessage.removeClass('d-none');
            }

            setTimeout(function () {
                $successMessage.addClass('d-none');
                $errorMessage.addClass('d-none');
            }, 5000);
        }, 1000);
    });
}