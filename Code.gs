/**
 * CODE.GS - Google Apps Script Backend (Mode API / Base de données)
 */

// 1. Affiche un message si on ouvre le lien directement
function doGet(e) {
  return ContentService.createTextOutput("La base de données est active. L'application doit l'appeler via POST.");
}

// 2. Fonction pour créer ou vider le tableau
function setupMatrixSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Tableau de Bord");
  
  if (!sheet) {
    sheet = ss.insertSheet("Tableau de Bord");
  } else {
    sheet.clear();
  }
  
  var headers = ["Groupes", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10"];
  sheet.getRange(1, 1, 1, 11).setValues([headers]);
  sheet.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#3b82f6").setFontColor("#ffffff");
  
  var groupes = [];
  for (var i = 1; i <= 9; i++) {
    groupes.push(["Groupe " + i]);
  }
  sheet.getRange(2, 1, 9, 1).setValues(groupes);
  sheet.getRange(2, 1, 9, 1).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
  
  sheet.setColumnWidths(2, 10, 100);
  sheet.setColumnWidth(1, 120);
  sheet.getDataRange().setHorizontalAlignment("center").setVerticalAlignment("middle");
  
  // Case de réinitialisation pour Mobile (Cellule L1)
  sheet.getRange("L1").insertCheckboxes().setBackground("#ef4444");
  sheet.getRange("M1").setValue("⬅️ COCHER POUR RESET").setFontColor("#ef4444").setFontWeight("bold");
  
  // Vider le Journal en même temps
  var journal = ss.getSheetByName("Journal Global");
  if (journal) {
    journal.clear();
    journal.appendRow(["Horodatage", "Groupe", "Enigme", "Valeur", "Statut", "Notes", "Lien Photo"]);
    journal.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
  }
  
  return sheet;
}

// 3. Reçoit les données envoyées par l'app (fetch)
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    var groupName = data.group; 
    var groupNum = parseInt(groupName.replace("Groupe ", ""));
    var puzzleId = parseInt(data.enigme.replace("E", ""));
    var value = data.valeur;
    var notes = data.notes;
    var isSuccess = data.isSuccess !== false; // true par défaut
    
    // --- GESTION DE LA PHOTO ---
    var imageUrl = "";
    if (data.imageData && isSuccess) {
      try {
        var base64Data = data.imageData.replace(/^data:image\/jpeg;base64,/, "");
        var decoded = Utilities.base64Decode(base64Data);
        var blob = Utilities.newBlob(decoded, MimeType.JPEG, groupName + "_E" + puzzleId + "_" + new Date().getTime() + ".jpg");
        
        // Créer un dossier "Photos_Escape_Game" s'il n'existe pas
        var folderIterator = DriveApp.getFoldersByName("Photos_Escape_Game");
        var folder;
        if (folderIterator.hasNext()) {
          folder = folderIterator.next();
        } else {
          folder = DriveApp.createFolder("Photos_Escape_Game");
        }
        
        var file = folder.createFile(blob);
        // Partager le fichier pour qu'il soit visible via le lien
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        imageUrl = file.getUrl();
      } catch (errImg) {
        imageUrl = "Erreur Photo: " + errImg.message;
      }
    }
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. JOURNAL GLOBAL (Historique complet)
    var journalSheet = ss.getSheetByName("Journal Global");
    if (!journalSheet) {
      journalSheet = ss.insertSheet("Journal Global");
      journalSheet.appendRow(["Horodatage", "Groupe", "Enigme", "Valeur", "Statut", "Notes", "Lien Photo"]);
      journalSheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
    }
    journalSheet.appendRow([new Date(), groupName, "E" + puzzleId, value, isSuccess ? "✅ Succès" : "❌ Erreur", notes || "", imageUrl]);
    
    // 2. TABLEAU DE BORD (Matrice)
    var matrixSheet = ss.getSheetByName("Tableau de Bord");
    if (!matrixSheet) {
      matrixSheet = setupMatrixSheet();
    }
    
    var row = groupNum + 1;
    var col = puzzleId + 1;
    
    var cell = matrixSheet.getRange(row, col);
    var currentBg = cell.getBackground();
    
    if (isSuccess) {
      var texte = value;
      if (notes && notes.trim() !== "") {
        texte += "\n✏️ " + notes;
      }
      if (imageUrl !== "") {
        texte += "\n📸 " + imageUrl;
      }
      cell.setValue(texte).setBackground("#dcfce7"); // Vert = OK
    } else {
      // Si on échoue et que ce n'est pas DÉJÀ réussi
      if (currentBg !== "#dcfce7") {
         var currentVal = cell.getValue();
         // On ajoute une croix supplémentaire (max 5 pour pas déborder)
         if ((currentVal.match(/❌/g) || []).length < 5) {
             cell.setValue(currentVal + "❌").setBackground("#fee2e2"); // Rouge = Erreur
         }
      }
    }
    
    return ContentService.createTextOutput("OK");
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message);
  }
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🎮 Escape Game')
      .addItem('🔄 Réinitialiser tous les Tableaux', 'setupMatrixSheet')
      .addToUi();
}

// 5. Déclencheur pour mobile (Checkbox en L1)
function onEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();
  
  // Si on coche la case en L1 sur l'onglet "Tableau de Bord"
  if (sheet.getName() == "Tableau de Bord" && range.getA1Notation() == "L1" && e.value == "TRUE") {
    setupMatrixSheet();
  }
}
