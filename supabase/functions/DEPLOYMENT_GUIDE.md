# 🚀 Edge Function Deployment Guide

## ✅ DEPLOYMENT FIXES COMPLETED

All critical deployment issues have been resolved:

### **Fixed Issues:**
1. ✅ **Shared Module Imports** - Removed all `../shared/` imports
2. ✅ **Bare Imports** - Replaced all bare imports with full URLs
3. ✅ **Import Map Consistency** - Standardized all import maps
4. ✅ **Version Mismatches** - Updated to consistent package versions

### **Functions Ready for Deployment:**
- `admin_get_users` ✅
- `admin_get_users_v2` ✅
- `agent_orchestration_stream` ✅
- `calculate_user_stance` ✅
- `classify_message` ✅
- `generate_issue_recommendations` ✅
- `generate_notion_statement` ✅
- `generate_proactive_prompt` ✅
- `ibis_embeddings` ✅
- `knowledge_query` ✅
- `link_similar_ibis_issues` ✅
- `pdf_processor` ✅
- `realtime_session` ✅
- `relationship_evaluator` ✅
- `voice_to_text` ✅

## 🚀 DEPLOYMENT STEPS

### **Step 1: Validate Before Deployment**
```bash
cd supabase/functions
node deployment-validator.cjs
```

### **Step 2: Deploy Functions**
You can deploy using either method:

#### **Option A: Deploy All Functions (Recommended)**
```bash
supabase functions deploy
```

#### **Option B: Deploy Individual Functions**
```bash
supabase functions deploy realtime_session
supabase functions deploy classify_message
supabase functions deploy knowledge_query
# ... etc for each function
```

### **Step 3: Verify Deployment**
```bash
supabase functions list
```

## 🔧 TROUBLESHOOTING

### **If You Still Get "Entrypoint path does not exist" Errors:**

1. **Clear Supabase Cache:**
   ```bash
   supabase functions deploy --no-verify-jwt
   ```

2. **Check Function Status:**
   ```bash
   supabase functions list
   ```

3. **Redeploy Specific Function:**
   ```bash
   supabase functions deploy [function-name] --no-verify-jwt
   ```

### **Common Issues and Solutions:**

| Issue | Solution |
|-------|----------|
| Import errors | All imports now use full URLs |
| Shared module errors | All shared imports removed |
| Version conflicts | All import maps standardized |
| Missing functions | All 15 functions present and valid |

## 📋 VALIDATION CHECKLIST

Before deploying, ensure:
- [ ] All functions pass `deployment-validator.cjs`
- [ ] No shared module imports (`../shared/`)
- [ ] All imports use full URLs (`https://esm.sh/...`)
- [ ] All functions have `import_map.json`
- [ ] All functions are in `config.toml`

## 🎯 EXPECTED OUTCOME

After deployment:
- ✅ No more "Entrypoint path does not exist" errors
- ✅ All 15 functions deploy successfully
- ✅ Functions respond to HTTP requests
- ✅ No import resolution errors

## 📞 SUPPORT

If you encounter issues:
1. Run the validator: `node deployment-validator.cjs`
2. Check the function logs in Supabase dashboard
3. Verify environment variables are set
4. Ensure all dependencies are available

---

**Status: Ready for Deployment** 🚀
