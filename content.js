(async function() {
  // Helper functions to get and set the Gemini API key in Chrome storage
  function getGeminiApiKey() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get("geminiApiKey", (data) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(data.geminiApiKey);
      });
    });
  }
  
  function setGeminiApiKey(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ geminiApiKey: key }, () => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(key);
      });
    });
  }
  
  // Retrieve the Gemini API key from storage; if absent, prompt the user for it.
  let geminiApiKey = await getGeminiApiKey();
  if (!geminiApiKey) {
    geminiApiKey = prompt("Please enter your Gemini API key:");
    if (geminiApiKey) {
      await setGeminiApiKey(geminiApiKey);
    } else {
      console.error("No Gemini API key provided. Extension will not function.");
      return;
    }
  }
  
  // Select all search result divs with role="listitem"
  const searchResults = Array.from(document.querySelectorAll('div[role="listitem"]'));
  
  // Collect brand names along with their corresponding DOM element
  const brandMapping = [];
  
  for (const item of searchResults) {
    const titleRecipe = item.querySelector('div[data-cy="title-recipe"]');
    if (!titleRecipe) continue;
    
    // Navigate through nested tags to reach the <span> containing the brand name.
    const brandNameElement = titleRecipe.querySelector('.s-title-instructions-style h2 span');
    if (!brandNameElement) continue;
    
    const brandName = brandNameElement.textContent.trim();
    if (brandName) {
      brandMapping.push({ brand: brandName, element: item });
    }
  }
  
  // Create a list of unique brand names
  const uniqueBrands = [...new Set(brandMapping.map(item => item.brand))];
  if (uniqueBrands.length === 0) {
    console.log("No brand names found.");
    return;
  }
  
  // Build a single prompt for Gemini that asks for a JSON mapping of each brand to "keep" or "delete"
  const promptText = `For the following brand names: ${uniqueBrands.join(', ')}\nReturn a JSON object where each key is a brand name and its value is either "keep" or "delete". Only return valid JSON.`;
  
  try {
    // Call the Gemini API using the correct endpoint and request structure.
    // The API key is passed as a query parameter.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: promptText
          }]
        }]
      })
    });
    
    const data = await response.json();
    console.log(data);
    // Assume the response contains a "candidates" array with an "output" field holding our generated text.
    var resultText;
    try {
        resultText = data.candidates[0].content.parts[0].text;
    } catch (TypeError) {
        console.error("Gemini response didn't take expected format:", data);
        return;
    }
    
    // Strip triple backticks (and optional "json") formatting from the result
    resultText = resultText
      .replace(/^\```(json)?\s*/i, "")
      .replace(/\s*```$/m, "")
      .trim();
    
    let decisionMapping;
    try {
      decisionMapping = JSON.parse(resultText);
    } catch (parseError) {
      console.error("Error parsing Gemini response as JSON:", parseError, resultText);
      return;
    }
    
    // Iterate over the collected brandMapping and remove search results marked for deletion.
    for (const { brand, element } of brandMapping) {
      const decision = decisionMapping[brand];
      console.log(`Decision for "${brand}":`, decision);
      if (decision === 'delete') {
        element.remove();
      }
    }
    
  } catch (error) {
    console.error("Error calling Gemini API:", error);
  }
})();
