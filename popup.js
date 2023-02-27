// Autotask API variables
const ApiIntegrationCode = // API integration code
const UserName = // API username
const Secret =  // API Secret key
const url = // API URL

// Headers for API requests
const myHeaders = new Headers();
myHeaders.append("ApiIntegrationCode", ApiIntegrationCode);
myHeaders.append("UserName", UserName);
myHeaders.append("Secret", Secret);
myHeaders.append("Content-Type", "application/json");

// options for API requests
const requestOptions = {
  method: 'GET',
  headers: myHeaders,
  redirect: 'follow'
};

// Global variables for access
let ticketId
let ticketObj
let ticketEntityInfo

// Data object
const parsedData = {
  category: "",
  company: "",
  companyId: "",
  companyLocationId: "",
  issueType: "",
  issueTypeValue: "",
  statusList: "",
  issueTypeList: "",
  subIssueTypeList: "",
  queue: "",
  soNumber: "",
  qty: "",
  resources: ""
}

// Sends message to content script for Ticket number
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  chrome.tabs.sendMessage(tabs[0].id, "Message request received from popup", function(response) {
    const titleElement = document.getElementById('ticket-title'); // sets title element of the popup.html
    if (chrome.runtime.lastError) {
      console.log("Error: " + chrome.runtime.lastError.message);
      titleElement.textContent = "Error: " + chrome.runtime.lastError.message;
    } else if (response && response.ticketId) {
      ticketId = response.ticketId;
      console.log("Response received from content script - ", response.ticketId);
      apiCall(response.ticketId); // Makes first API call for ticket details and resources
    } else {
      titleElement.textContent = "Error: could not get ticket ID from content script.";
    }
  });
});

// API call to get ticket information based on ticket ID, also makes a request to get the current resources
async function apiCall(ticketId) {
  const response1 = fetch(`${url}tickets/query?search={"filter":[{"op":"eq","field":"ticketNumber","value":"${ticketId}"}]}`, requestOptions); // Fetches ticket information
  const response2 = fetch(`${url}Resources/query?search={"filter":[{"op":"like","field":"FirstName","value":"%"}]}`, requestOptions); // Fetches all resources

  const [data1, data2] = await Promise.all([response1, response2].map(p => p.then(res => res.json())));

  // Process data from API calls
  ticketObj = data1.items[0];
  parsedData.resources = data2.items;

  sortAlphabetically(parsedData.resources, 'userName');

  console.log("ticketobj", ticketObj);
  console.log("resources", parsedData.resources);

  getEntityInformation()
};

// API call to get all current ticket entity fields
async function getEntityInformation() {
    const response1 = fetch(`${url}Tickets/entityinformation/fields`, requestOptions); // Fetches all ticket entity (fields) information. All issue-types / status's etc
    const [data1] = await Promise.all([response1].map(p => p.then(res => res.json())));

    // Process data from API calls
    ticketEntityInfo = data1.fields
    console.log("ticketentity", ticketEntityInfo);
    parseTicketEntityInfo(ticketObj, ticketEntityInfo)
};

// Parses the ticket entity object for easier data access
function parseTicketEntityInfo(ticketObj, ticketEntityInfo) {
  parsedData.statusList = ticketEntityInfo.find(obj => obj.name === 'status').picklistValues; // Finds all ticket status's from the ticket entity
  sortAlphabetically(parsedData.statusList, 'label');

  parsedData.queue = ticketEntityInfo.find(obj => obj.name === 'queueID').picklistValues; // Finds all queue pick list values from the ticket entity
  sortAlphabetically(parsedData.queue, 'label');

  parsedData.issueTypeList = ticketEntityInfo.find(obj => obj.name === 'issueType').picklistValues; // Finds all issue-type pick list values from the ticket entity
  sortAlphabetically(parsedData.issueTypeList, 'label');

  parsedData.subIssueTypeList = ticketEntityInfo.find(obj => obj.name === 'subIssueType').picklistValues; // Finds all sub-issue-type pick list values from the ticket entity

  parseCompany(ticketObj)
  parseSoNumber(ticketObj)
  parseQty(ticketObj)
  parseIssueType(ticketObj)
};

// Sort object alphabetically for display purposes
function sortAlphabetically(object, key) {
  object.sort((a, b) => {
    const textA = a[key].toUpperCase();
    const textB = b[key].toUpperCase();
    return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
  });
}



// Parses ticket title for company name
function parseCompany(ticketObj) {
  const companyStr = ticketObj.title.split(':');
  parsedData.company = companyStr[2].trim()
  getCompanyId(parsedData.company)
};

// API call to get the company id based on the company name
async function getCompanyId(companyName) {
  await fetch(`${url}Companies/query?search={"filter":[{"op":"eq","field":"CompanyName","value":"${companyName}"}]}`, requestOptions) // Fetches company ID based on company name
    .then(response => response.json())
    .then(result => parsedData.companyId = result.items[0].id)
    .catch(error => console.log('error', error));

    if (parsedData.companyId) {
      getCompanyLocationId(parsedData.companyId)
    } else {
      const titleElement = document.getElementById('ticket-title');
      titleElement.textContent = "Error: Company Not Found";
    };

};

// API call to get the company location, needed to make a patch request to update a ticket company
async function getCompanyLocationId(companyId) {
  await fetch(`${url}Companies/${companyId}/Locations`, requestOptions) // Fetches company ID (Needed for ticket company patch request). This is assuming there is only one location per company
    .then(response => response.json())
    .then(result => parsedData.companyLocationId = result.items[0].id)
    .catch(error => console.log('error', error));

  console.log("Finished! ParsedData - ", parsedData)
  formInsert()
};

// Parses SO number from ticket title
function parseSoNumber(ticketObj) {
  const regex = /SO:\s*([^\s)]+)/;  // Matches "SO:" followed by non-space and non-closing-parenthesis characters
  const match = ticketObj.title.match(regex);  // Extracts the matched substring
  const result = match[1];  // Extracts the captured group from the match
  parsedData.soNumber = result;
}

//Parses qty from ticket description
function parseQty(ticketObj) {
  const match = ticketObj.description.match(/Line Details:\s*(\d+)/); // Matches the first digit after the Line details text
  const result = match ? match[1] : null; // Sets to null if undefined
  parsedData.qty = result;
}

// Parses Issue-type from ticket description, also gets the id value number related to that issue-type
// Also sets a ticket category for default assignment
function parseIssueType(ticketObj) {
  const match = ticketObj.description.match(/DDS-[A-Z*]*[0-9]*-*[A-Z*]*[0-9]*-*[A-Z*]*[0-9]*-*[A-Z*]*[0-9]*-*/); // Matches the DDS sku on line 1. This is assuming all SKU's start with a DDS code
  const result = match ? match[0] : null;
  parsedData.issueType = result;
  parsedData.issueTypeValue = parsedData.issueTypeList.find(obj => obj.label === parsedData.issueType).value; // Searches the parsed issue-type list and finds the value of the issue type based on the extracted text
  if (parsedData.issueType.includes("DDS-EP") || parsedData.issueType.includes("DDS-AST") || parsedData.issueType.includes("DDS-NUC")) {
    parsedData.category = "endpoints"
  } else if (parsedData.issueType.includes("DDS-SVR") || parsedData.issueType.includes("DDS-STO")|| parsedData.issueType.includes("DDS-UC")) {
    parsedData.category = "server"
  } else if (parsedData.issueType.includes("DDS-DAS")) {
    parsedData.category = "das"
  } else if (parsedData.issueType.includes("DDS-NET")) {
    parsedData.category = "networking"
  } else if (parsedData.issueType.includes("DDS-LTO")) {
    parsedData.category = "tapes"
  } else {
    parsedData.category = "unknown"
  };
}

// Starts to insert HTML into the popup.html with the data from the ticket
function formInsert() {
  const titleElement = document.getElementById('ticket-title');
  titleElement.textContent = ticketObj.title; // Inserts the ticket title

  const companyInput = document.getElementById('company-name');
  companyInput.value = parsedData.company; // Inserts the company name

  const pickingSlipInput = document.getElementById('so-number');
  pickingSlipInput.value = parsedData.soNumber; // inserts the SO number

  const qtyInput = document.getElementById('config-quantity');
  qtyInput.value = parsedData.qty; // Inserts the qty

  parsedData.resources.forEach(resource => resourceFormInput(resource)); // For each method on the Resources list to set a select option for each resource
  parsedData.queue.forEach(queue => queueFormInput(queue)); // For each method on the queue list to set a select option for each queue
  parsedData.issueTypeList.forEach(issueType => issueTypeFormInput(issueType)); // For each method on the issue-type list to set a select option for each resource
  parsedData.statusList.forEach(statusOption => statusFormInput(statusOption)); // // For each method on the status list to set a select option for each status
  const selectedSubIssueList = parsedData.subIssueTypeList.filter(obj => obj.parentValue === parsedData.issueTypeValue); // filters sub issue type list for only ones matching the issue type parent value
  selectedSubIssueList.forEach(subIssue => subIssueTypeFormInput(subIssue)) // For each method on the reduced (parent value) sub-issue-type list to set a select option for each sub-issue for the relevant issue-type
}

// Adds resource list to html
function resourceFormInput(resource) {
  const select = document.getElementById('primary-resource');
  const option = document.createElement('option');
  option.value = resource.id;
  option.text = resource.userName;
  select.add(option);

  if (parsedData.category == "endpoints") {
    document.querySelector('#primary-resource').value = '29682909';
  } else if (parsedData.category == "server") {
    document.querySelector('#primary-resource').value = '29682908';
  } else if (parsedData.category == "das") {
    document.querySelector('#primary-resource').value = '29682941';
  } else if (parsedData.category == "networking") {
    document.querySelector('#primary-resource').value = '29682906';
  } else if (parsedData.category == "tapes") {
    document.querySelector('#primary-resource').value = '29682937';
  } else {
    document.querySelector('#primary-resource').value = '29682909';
  };
}

// Adds queues to the html
function queueFormInput(queue) {
  const select = document.getElementById('queue');
  const option = document.createElement('option');
  option.value = queue.value;
  option.text = queue.label;
  select.add(option);

  if (parsedData.category == "endpoints") {
    document.querySelector('#queue').value = '29683488';
  } else if (parsedData.category == "server") {
    document.querySelector('#queue').value = '29683490';
  } else if (parsedData.category == "das") {
    document.querySelector('#queue').value = '29683509';
  } else if (parsedData.category == "networking") {
    document.querySelector('#queue').value = '29683489';
  } else if (parsedData.category == "tapes") {
    document.querySelector('#queue').value = '29683495';
  } else {
    document.querySelector('#queue').value = '29683488';
  };
};

// Adds the issue-types to the html and sets the default issue-type to the parsed description data
function issueTypeFormInput(issueType) {
  const select = document.getElementById('issue-type');
  const option = document.createElement('option');
  option.value = issueType.value;
  option.text = issueType.label;
  select.add(option);
  document.querySelector('#issue-type').value = parsedData.issueTypeValue; // Sets the default option to the parsed issue-type
}

// Adds the sub issue types to the html based on the issue type selected
function subIssueTypeFormInput(subIssue) {
  const select = document.getElementById('sub-issue-type');
  const option = document.createElement('option');
  option.value = subIssue.value;
  option.text = subIssue.label;
  select.add(option);
}


// Adds the status's to the html and sets the default to in-progress
function statusFormInput(statusOption) {
  const select = document.getElementById('status');
  const option = document.createElement('option');
  option.value = statusOption.value;
  option.text = statusOption.label;
  select.add(option);
  document.querySelector('#status').value = '8'; // Sets the default option to in-progress
}


const form = document.querySelector('form')

form.addEventListener('submit', event => {
  event.preventDefault();

    const formData = {
      company: document.getElementById('company-name').value,
      status: document.getElementById('status').value,
      issueType: document.getElementById('issue-type').value,
      subIssueType: document.getElementById('sub-issue-type').value,
      queue: document.getElementById('queue').value,
      primaryResource: document.getElementById('primary-resource').value,
      pickingSlipNo: document.getElementById('so-number').value,
      configQuantity: document.getElementById('config-quantity').value,
    };
    console.log("formData", formData)
    ticketUpdatePatchApiCall(formData)
});


function ticketUpdatePatchApiCall(formData) {

  const raw = JSON.stringify({
    "id": ticketObj.id,
    "companyID": parsedData.companyId,
    "companyLocationID": parsedData.companyLocationId,
    "contactID": "",
    "issueType": formData.issueType,
    "status": formData.status,
    "queueID": formData.queue,
    "subIssueType": formData.subIssueType,
    "assignedResourceID": formData.primaryResource,
    "assignedResourceRoleID": 29683355,  // May need to change this or do a search as this is a static value that the engineers all seem to have
    "userDefinedFields": [
      {
        "name": "Config Quantity",
        "value": formData.configQuantity
      },
      {
        "name": "Picking Slip No",
        "value": formData.pickingSlipNo
      }
    ]
  });

  const patchRequestOptions = {
    method: 'PATCH',
    headers: myHeaders,
    body: raw,
    redirect: 'follow'
  };

  fetch(`${url}Tickets`, patchRequestOptions)
    .then(response => response.json())
    .then(result => {
      if (result.itemId) {
        console.log("Success", result);
        document.getElementById('success-fail-message').textContent = "Ticket Successfully Updated! Page will reload";
        setTimeout(() => {
          reloadPage();
      }, 1500); // Wait for 1.5 seconds before reloading the page
      } else {
        console.log(result)
        document.getElementById('success-fail-message').textContent = result.errors
      };
    })
    .catch(error => console.log('error', error));
};


// If patch request is successful sends message to content script to update current tab
function reloadPage() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, "Ticket successfully updated reloading page", function(response) {
      const titleElement = document.getElementById('ticket-title'); // sets title element of the popup.html
      console.log(response)
      if (chrome.runtime.lastError) {
        console.log("Error: " + chrome.runtime.lastError.message);
        titleElement.textContent = "Error: " + chrome.runtime.lastError.message;
      } else if (response && response.page) {
        console.log("Response received from content script - page reloading");
        window.close()
      } else {
        titleElement.textContent = "Error: Page could not be reloaded";
      }
    });
  });
};
