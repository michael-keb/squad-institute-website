/** Free form → email via FormSubmit (no SendGrid / no API key). */
(function () {
  var TO = "career@thesquadinstitute.com";
  var ENDPOINT = "https://formsubmit.co/ajax/" + encodeURIComponent(TO);

  window.SI_FORM_MAIL = {
    to: TO,
    endpoint: ENDPOINT,

    /**
     * @param {Record<string, string>} fields  Named fields emailed to the inbox
     * @param {{ subject?: string, replyTo?: string }} [opts]
     */
    send: async function (fields, opts) {
      opts = opts || {};
      var body = Object.assign({}, fields, {
        _subject: opts.subject || "[Website] Contact",
        _template: "box",
        _captcha: "false",
        _honey: fields._honey || "",
      });
      if (opts.replyTo) body._replyto = opts.replyTo;

      var res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || data.success === "false" || data.error) {
        throw new Error(
          data.message || data.error || "Could not send (HTTP " + res.status + ")",
        );
      }
      return data;
    },
  };
})();
