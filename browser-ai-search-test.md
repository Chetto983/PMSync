# Browser AI Search Debugging Guide

## ✅ Backend is Working!
Your AI search backend is working perfectly. Test results:
- Query: "test"
- Results: 5 emails found
- Top result: "TEST: Black Friday di YallaYalla..." (Score: 0.244)

## 🔍 Frontend Debugging Steps

Since the backend works, the issue is in the frontend display. Follow these steps:

### Step 1: Open Browser Console
1. Press `F12` to open DevTools
2. Go to **Console** tab
3. Clear all previous messages

### Step 2: Test AI Search
1. Find the AI search bar in the header (should have a purple sparkle ✨ icon)
2. Type "test" in the search bar
3. Wait 500ms (there's a debounce)
4. Watch the Console for errors

### Step 3: Check Network Requests
1. Go to **Network** tab in DevTools
2. Type "test" in AI search bar
3. Look for request to `/ai/memory/search`
4. Click on the request to see:
   - Request Headers (should have your JWT token)
   - Response (should show 5 results)

### Common Issues & Fixes

#### Issue 1: "Cannot read property 'items' of undefined"
**Cause**: API response structure mismatch
**Fix**: Check if response has `.data.items` vs just `.items`

#### Issue 2: No dropdown appears
**Possible causes**:
- CSS z-index too low
- Popper positioning off-screen
- `open` state not setting to true

**Debug**:
```javascript
// In browser console, after typing in search bar:
// This should show the component state
document.querySelector('[placeholder*="Ask AI"]')
```

#### Issue 3: "401 Unauthorized" or "403 Forbidden"
**Cause**: JWT token expired
**Fix**: Refresh the page and try again

### Step 4: Manual API Test in Browser Console

Paste this in the browser console to test the API directly:

```javascript
// Test AI search API
fetch('http://localhost:3000/ai/memory/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('auth-storage') && JSON.parse(localStorage.getItem('auth-storage')).state.token
  },
  body: JSON.stringify({ query: 'test', limit: 5 })
})
.then(r => r.json())
.then(data => {
  console.log('✅ API Response:', data);
  console.log(`Found ${data.items.length} results`);
  data.items.forEach((item, i) => {
    console.log(`${i+1}. ${item.subject} (score: ${item.score})`);
  });
})
.catch(err => console.error('❌ Error:', err));
```

### Step 5: Check Component Rendering

Look for these elements in the DOM:
1. **AI Search Input**: Should have `placeholder="Ask AI about your emails..."`
2. **Popper Container**: Should appear when results are ready
3. **List Items**: Should show email subjects

### Step 6: Verify Component Props

Check that `handleAISearchResultClick` is properly passed to AISearchBar:

```javascript
// In Mailbox.tsx around line 1117-1121, should have:
<AISearchBar
  onResultClick={handleAISearchResultClick}
  placeholder="Ask AI about your emails..."
  size="small"
/>
```

## 📋 Expected Behavior

When working correctly:
1. Type in AI search bar
2. After 500ms, see loading spinner
3. Results dropdown appears below the search bar
4. Click on a result → email opens in ThreadDisplay

## 🐛 If Still Not Working

Share these details:
1. Console errors (copy full error message)
2. Network request status (200 OK? 404? 500?)
3. Screenshot of the AI search bar location
4. Browser DevTools Network tab screenshot showing the API call

## 🎯 Quick Fixes to Try

### Fix 1: Hard Refresh
Press `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac) to clear cache

### Fix 2: Check if Component is Rendered
```javascript
// In browser console:
document.querySelectorAll('[placeholder*="Ask AI"]').length
// Should return 1 if component is rendered
```

### Fix 3: Inspect Component State
If you have React DevTools installed:
1. Find `AISearchBar` component
2. Check its state:
   - `query`: should have your text
   - `results`: should be array with 5 items after search
   - `loading`: should be false after search completes
   - `open`: should be true when results are ready

## ✅ Success Indicators

You'll know it's working when:
- Typing triggers loading spinner after 500ms
- Network tab shows 200 OK response from `/ai/memory/search`
- Dropdown appears with email subjects
- Clicking a result opens the email
