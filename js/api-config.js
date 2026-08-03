/** API base for form submissions. Override with window.SI_API before this script loads if needed. */
(function () {
  var host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    window.SI_API = window.SI_API || "http://localhost:8787";
  } else {
    window.SI_API = window.SI_API || "https://squad-institute-api.onrender.com";
  }
})();
