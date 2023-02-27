chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(message); // Log the message to the console
  if (message === "Message request received from popup" && document.querySelector('.IdentificationText').textContent) { // Checks for element Identification text which is the ticket ID number
    const identificationText = document.querySelector('.IdentificationText').textContent;
    sendResponse({ ticketId: identificationText }); // Sends the ticket ID back to the popup for API calls
  } else if (message === "Ticket successfully updated reloading page") {
      location.reload();
      sendResponse({ page: "reloading" });
  } else {
    sendResponse({ error: 'Identification text not found.' });
  };
});
