/**
 * CODE.GS - Google Apps Script Backend
 * A déployer comme une Web Application.
 */

function doGet(e) {
  // Gestion du mode Admin ou Elève
  var isAdmin = e.parameter.admin === 'true';
  var page = isAdmin ? 'Admin' : 'Index';
  return HtmlService.createTemplateFromFile(page)
      .evaluate()
      .setTitle("Escape Game : Protocole Horizon")
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Fonction pour enregistrer une réponse depuis l'app
 * @param {number} groupe - Numéro du groupe (1-9)
 * @param {number} enigme - ID de l'énigme
 * @param {string} valeur - Réponse saisie
 * @param {string} notes - Notes facultatives
 */
function enregistrerReponse(groupe, enigme, valeur, notes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Suivi");
  if (!sheet) {
    sheet = ss.insertSheet("Suivi");
    sheet.appendRow(["Horodatage", "Groupe", "Enigme", "Valeur", "Notes"]);
  }
  sheet.appendRow([new Date(), "Groupe " + groupe, "E" + enigme, valeur, notes || ""]);
  return "Succès";
}

/**
 * Fonction pour récupérer le statut de tous les groupes (pour la vue admin)
 */
function getGlobalStatus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Suivi");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  // Traitement simple pour renvoyer le dernier état de chaque groupe
  return data.slice(1); // On saute l'en-tête
}
