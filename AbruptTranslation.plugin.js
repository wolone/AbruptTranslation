/**
 * @name AbruptTranslation
 * @author Maige
 * @description 🌍 更适合中国宝宝体质的 Discord 翻译插件
 * @version 3.0.0
 * @website https://x.com/unflwMaige
 * @source https://github.com/Maigee/AbruptTranslation
 */

module.exports = class AbruptTranslation {
    constructor() {
        this.name = "AbruptTranslation";
        this.version = "3.0.0";
        
        // 最少必需状态
        this.translating = 0;
        this.cache = new Map(); // 简单的缓存
        
        // 预定义平台配置
        this.predefinedPlatforms = {
            siliconflow: {
                name: "硅基流动",
                baseUrl: "https://api.siliconflow.cn/v1/chat/completions",
                displayName: "SiliconFlow"
            },
            aihubmix: {
                name: "AIHUBMIX",
                baseUrl: "https://aihubmix.com/v1/chat/completions",
                displayName: "AIHUBMIX"
            },
            deepseek: {
                name: "DeepSeek",
                baseUrl: "https://api.deepseek.com/chat/completions",
                displayName: "DeepSeek"
            }
        };

        // 极简配置
        this.settings = {
            apiKey: "",
            baseUrl: "",
            model: "",
            targetLang: "zh-CN",
            language: "en", // 插件界面语言：en/zh-CN
            prompt: "Translate the following text to {targetLang}, return only the translation::\\n\\n翻译结果在符合原意的基础上，可以进行口语化/网络用语化/年轻化的加工。\\n注意：最终只需要译文，不要出现其他任何提示或者解释或者思考过程，仅需要输出译文。\\n\\n{text}",
            // 多API管理
            apis: [], // 保存的API配置列表
            currentApiIndex: 0, // 当前使用的API索引
            selectedPlatform: null // 选中的预定义平台
        };
        
        this.loadSettings();
        
        // 语言文本配置
        this.texts = {
            en: {
                pluginName: "AbruptTranslation Settings",
                apiKey: "API Key:",
                baseUrl: "Base URL:",
                model: "Model:",
                targetLang: "Target Language:",
                language: "Plugin Language:",
                prompt: "Translation Prompt:",
                usage: "Usage: Double-click any message to translate, double-click again to hide translation.",
                newFeature: "New Feature: Intelligent separation of quoted and reply content for clearer visual distinction.",
                saveBtn: "Save Settings",
                testBtn: "Test API",
                clearBtn: "Clear Translations",
                chinese: "Chinese",
                english: "English",
                japanese: "Japanese",
                korean: "Korean"
            },
            "zh-CN": {
                pluginName: "AbruptTranslation 设置",
                apiKey: "API Key:",
                baseUrl: "Base URL:",
                model: "模型:",
                targetLang: "目标语言:",
                language: "插件语言:",
                prompt: "翻译提示词:",
                usage: "使用说明：双击任意消息翻译，再次双击隐藏译文。",
                newFeature: "新特性：智能分离引用和回复内容，视觉区分更清晰。",
                saveBtn: "保存设置",
                testBtn: "测试API",
                clearBtn: "清除翻译",
                chinese: "中文",
                english: "英文",
                japanese: "日文",
                korean: "韩文"
            }
        };
    }

    
    // 获取当前语言文本
    getText(key) {
        return this.texts[this.settings.language] ? this.texts[this.settings.language][key] : this.texts.en[key];
    }

    start() {
        console.log("🚀 简洁双击翻译器启动");
        this.setupDoubleClickTranslation();
        console.log("✅ 插件启动完成 - 双击消息即可翻译");
    }
    
    stop() {
        console.log("🛑 停止插件");
        this.cleanup();
        console.log("✅ 插件已停止");
    }
    
    // BetterDiscord可选方法
    getSettingsPanel() {
        return this.createSettingsPanel();
    }
    
    cleanup() {
        // 移除双击事件监听
        if (this.handleDoubleClick) {
            document.removeEventListener('dblclick', this.handleDoubleClick);
        }
        this.clearAllTranslations();
    }

    loadSettings() {
        try {
            const saved = BdApi.Data.load(this.name, "settings");
            if (saved) {
                Object.assign(this.settings, saved);
            }
        } catch (error) {
            console.log("使用默认设置");
        }
    }
    
    saveSettings() {
        BdApi.Data.save(this.name, "settings", this.settings);
    }
    
    updateTranslatingStatus() {
        // 在控制台显示翻译状态
        if (this.translating > 0) {
            console.log(`🔄 working... (${this.translating}条消息)`);
        }
    }

    // =========================================================================
    // 双击翻译功能 - 简单直接，双击即翻译
    // =========================================================================
    
    setupDoubleClickTranslation() {
        // 绑定双击事件到文档
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        document.addEventListener('dblclick', this.handleDoubleClick);
        console.log('✅ 双击翻译功能已启用');
    }
    
    handleDoubleClick(event) {
        const messageElement = this.findMessageElement(event.target);
        if (!messageElement) return;
        
        this.translateMessage(messageElement);
    }
    
    // 找到消息元素
    findMessageElement(element) {
        // 向上遍历DOM树，找到消息容器
        let current = element;
        while (current && current !== document) {
            const className = current.className || "";
            // Discord消息元素的典型特征
            if (className.includes("messageListItem") || 
                className.includes("message-") ||
                current.id?.startsWith("chat-messages-")) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }
    
    // =========================================================================
    // 消息文本提取 - 精确提取，处理引用消息
    // =========================================================================
    
    // 智能提取 - 分离引用和回复，清理干扰信息
    extractText(element) {
        const result = this.extractMessageParts(element);
        
        // 如果有引用和回复，分别处理
        if (result.hasQuote && result.replyText) {
            return {
                isComplex: true,
                quoteText: result.quoteText,
                replyText: result.replyText,
                fullText: `${result.quoteText} ${result.replyText}`
            };
        }
        
        // 普通消息直接返回清理后的文本
        return {
            isComplex: false,
            fullText: result.fullText || result.replyText || ""
        };
    }
    
    // 提取消息各部分内容
    extractMessageParts(element) {
        // 查找所有可能的内容容器
        const contentElements = element.querySelectorAll('[class*="messageContent"], [class*="markup"]');
        
        let quoteText = "";
        let replyText = "";
        let fullText = "";
        let hasQuote = false;
        
        if (contentElements.length >= 2) {
            // 可能是引用消息：第一个是引用，第二个是回复
            const firstEl = contentElements[0];
            const secondEl = contentElements[1];
            
            quoteText = this.cleanText(firstEl.textContent);
            replyText = this.cleanText(secondEl.textContent);
            hasQuote = true;
            
            console.log(`📝 检测到引用消息 - 引用: "${quoteText.substring(0, 30)}..." 回复: "${replyText.substring(0, 30)}..."`);
        } else if (contentElements.length === 1) {
            // 普通消息
            fullText = this.cleanText(contentElements[0].textContent);
            console.log(`📝 提取普通消息: "${fullText.substring(0, 50)}..."`);
        } else {
            // 备用方案：直接从元素获取
            fullText = this.cleanText(element.textContent);
            console.log(`📝 备用提取: "${fullText.substring(0, 50)}..."`);
        }
        
        return { quoteText, replyText, fullText, hasQuote };
    }
    
    // 彻底清理文本干扰
    cleanText(text) {
        if (!text) return "";
        
        return text
            // 清理Discord特殊字符
            .replace(/\u200B/g, '') // 零宽空格
            .replace(/\u200D/g, '') // 零宽连字符  
            .replace(/\uFEFF/g, '') // 字节顺序标记
            // 清理时间戳和ID模式
            .replace(/\b\d{10,20}\b/g, '') // 长数字ID
            .replace(/\b(?:Today|Yesterday|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/gi, '') // 时间戳
            .replace(/\b(?:AM|PM)\b/gi, '') // 上午下午
            // 清理多余空白
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    // =========================================================================
    // 翻译功能 - 简单直接，一次翻译一条消息
    // =========================================================================
    
    async translateMessage(messageElement) {
        const existingTranslation = messageElement.querySelector(".translation-result, .translation-container");
        if (existingTranslation) {
            this.toggleTranslationVisibility(messageElement);
            return;
        }
        
        // 正常翻译流程
        const textData = this.extractText(messageElement);
        const fullText = textData?.fullText || "";
        if (!fullText || fullText.trim().length < 2) return;
        if (messageElement.querySelector('[class*="localUser"]')) return;
        
        messageElement.dataset.translated = "true";
        
        try {
            this.translating++;
            this.updateTranslatingStatus();
            
            if (textData.isComplex) {
                await this.translateComplexMessage(messageElement, textData);
            } else {
                const loadingEl = this.insertTranslation(messageElement, "🔄 working...", true);
                const translation = await this.getTranslation(fullText);
                loadingEl.textContent = translation;
                loadingEl.style.fontStyle = "normal";
                loadingEl.style.opacity = "1";
            }
        } catch (error) {
            console.error("翻译失败:", error);
            this.insertTranslation(messageElement, `翻译失败: ${error.message}`, false, true);
        } finally {
            this.translating = Math.max(0, this.translating - 1);
            this.updateTranslatingStatus();
        }
    }
    
    // 翻译复杂消息（引用+回复）
    async translateComplexMessage(messageElement, textData) {
        const { quoteText, replyText } = textData;
        
        // 创建容器
        const container = this.createTranslationContainer(messageElement);
        
        // 显示加载状态
        const loadingDiv = document.createElement("div");
        loadingDiv.className = "translation-loading";
        loadingDiv.textContent = "🔄 working...";
        loadingDiv.style.cssText = `
            padding: 8px 12px !important;
            color: #666 !important;
            font-style: italic !important;
            font-size: 13px !important;
        `;
        container.appendChild(loadingDiv);
        
        try {
            // 翻译引用内容
            if (quoteText && quoteText.length > 2) {
                const quoteTranslation = await this.getTranslation(quoteText);
                const quoteDiv = this.createQuoteTranslation(quoteTranslation);
                container.appendChild(quoteDiv);
            }
            
            // 翻译回复内容  
            if (replyText && replyText.length > 2) {
                const replyTranslation = await this.getTranslation(replyText);
                const replyDiv = this.createReplyTranslation(replyTranslation);
                container.appendChild(replyDiv);
            }
        } finally {
            // 移除加载状态
            loadingDiv.remove();
        }
    }
    
    // 翻译普通消息
    async translateSimpleMessage(messageElement, text) {
        const translation = await this.getTranslation(text);
        this.insertTranslation(messageElement, translation);
    }
    
    // 获取翻译（带缓存）
    async getTranslation(text) {
        if (this.cache.has(text)) {
            console.log('✅ 使用缓存结果');
            return this.cache.get(text);
        }
        
        const translation = await this.callAPI(text);
        this.cache.set(text, translation);
        return translation;
    }
    
    toggleTranslationVisibility(messageElement) {
        const translations = messageElement.querySelectorAll('.translation-result, .translation-container');
        translations.forEach(el => {
            const isHidden = el.style.display === 'none';
            if (isHidden) {
                el.style.removeProperty('display');
            } else {
                el.style.setProperty('display', 'none', 'important');
            }
        });
    }
    
    // 创建翻译容器
    createTranslationContainer(messageElement) {
        const existing = messageElement.querySelector(".translation-container");
        if (existing) existing.remove();
        
        const container = document.createElement("div");
        container.className = "translation-container";
        container.style.cssText = `
            margin: 8px 0 4px 0 !important;
            display: block !important;
            position: relative !important;
        `;
        
        messageElement.appendChild(container);
        return container;
    }
    
    // 创建引用翻译样式
    createQuoteTranslation(text) {
        const div = document.createElement("div");
        div.className = "translation-result quote-translation";
        div.innerHTML = `<span style="color: #666; font-size: 12px; margin-right: 8px;">📋:</span>${text}`;
        
        div.style.cssText = `
            margin: 4px 0 !important;
            padding: 8px 12px !important;
            border-left: 3px solid #9e9e9e !important;
            background: #f5f5f5 !important;
            border-radius: 4px !important;
            font-size: 13px !important;
            color: #555 !important;
            font-style: italic !important;
            display: block !important;
            position: relative !important;
            z-index: 1000 !important;
        `;
        
        return div;
    }
    
    // 创建回复翻译样式
    createReplyTranslation(text) {
        const div = document.createElement("div");
        div.className = "translation-result reply-translation";
        div.innerHTML = `<span style="color: #2196f3; font-size: 12px; margin-right: 8px;">💬:</span>${text}`;
        
        div.style.cssText = `
            margin: 4px 0 !important;
            padding: 10px 14px !important;
            border-left: 4px solid #2196f3 !important;
            background: #e3f2fd !important;
            border-radius: 6px !important;
            font-size: 14px !important;
            color: #1565c0 !important;
            font-weight: 500 !important;
            display: block !important;
            position: relative !important;
            z-index: 1000 !important;
        `;
        
        return div;
    }
    
    // 简单消息翻译插入
    insertTranslation(messageElement, text, isLoading = false, isError = false) {
        const existing = messageElement.querySelector(".translation-result");
        if (existing) existing.remove();
        
        const div = document.createElement("div");
        div.className = "translation-result";
        div.textContent = text;
        
        div.style.cssText = `
            margin: 8px 0 4px 0 !important;
            padding: 10px 14px !important;
            border-left: 4px solid ${isError ? '#ed4245' : '#2196f3'} !important;
            background: ${isError ? '#ffebee' : '#e3f2fd'} !important;
            border-radius: 6px !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            font-style: ${isLoading ? 'italic' : 'normal'} !important;
            opacity: ${isLoading ? '0.8' : '1'} !important;
            color: ${isError ? '#d32f2f' : '#1565c0'} !important;
            display: block !important;
            position: relative !important;
            z-index: 1000 !important;
            visibility: visible !important;
        `;
        
        messageElement.appendChild(div);
        return div;
    }

    // 增强版API调用 - 提供详细错误信息
    async callAPI(text) {
        // 如果有保存的API，使用当前选中的API
        if (this.settings.apis && this.settings.apis.length > 0) {
            const currentAPI = this.settings.apis[this.settings.currentApiIndex];
            if (currentAPI) {
                this.settings.apiKey = currentAPI.apiKey;
                this.settings.baseUrl = currentAPI.baseUrl;
                this.settings.model = currentAPI.model;
                this.settings.currentPlatform = currentAPI.platform || null; // 保存当前平台信息
            }
        }

        // 使用增强的API调用方法
        return this.enhancedCallAPI(text);
    }

    // =========================================================================
    // 工具函数 - 简单实用
    // =========================================================================
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    clearAllTranslations() {
        document.querySelectorAll(".translation-result, .translation-container").forEach(el => el.remove());
        document.querySelectorAll('[data-translated="true"]').forEach(el => {
            delete el.dataset.translated;
        });
    }

    // =========================================================================
    // 设置面板 - 实用为主，不搞花哨
    // =========================================================================
    
    createSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.cssText = `
            padding: 20px;
            background: white;
            border-radius: 8px;
            max-width: 600px;
        `;

        panel.innerHTML = `
            <h3 style="margin: 0 0 20px 0; color: #5865f2;">🌌 ${this.getText('pluginName')} (增强版)</h3>

            <!-- 基础设置 -->
            <div style="margin-bottom: 30px; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                <h4 style="margin: 0 0 15px 0; color: #495057;">📋 基础设置</h4>
                ${this.createBasicSettingsHTML()}
            </div>

            <!-- 多API管理 -->
            <div style="margin-bottom: 30px; padding: 15px; background: #e3f2fd; border-radius: 6px;">
                <h4 style="margin: 0 0 15px 0; color: #1565c0;">🔧 多API管理</h4>
                ${this.createMultiAPIHTML()}
            </div>

            <!-- 功能说明 -->
            <div style="margin-bottom: 20px; padding: 12px; background: #f0f8ff; border-radius: 6px; border-left: 4px solid #5865f2;">
                <p style="margin: 0; color: #2c5282; font-size: 14px;">
                    ✨ <strong>新功能：</strong>多API保存、增强错误提示、智能API切换
                </p>
            </div>

            <div style=\"display: flex; gap: 10px; flex-wrap: wrap;\">\n                <button id=\"testBtn\" style=\"flex: 1; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;\">${this.getText('testBtn')}</button>\n                <button id=\"clearBtn\" style=\"padding: 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;\">${this.getText('clearBtn')}</button>\n            </div>

            <div id="status" style="margin-top: 10px; padding: 8px; border-radius: 4px; display: none;"></div>
        `;

        // 绑定事件
        this.bindBasicSettingsEvents(panel);
        this.bindMultiAPIEvents(panel);
        this.bindActionEvents(panel);

        return panel;
    }
    
    
    
    
    
    showStatus(panel, message, type = "info") {
        const status = panel.querySelector("#status");
        const colors = {
            success: "#d4edda",
            error: "#f8d7da",
            info: "#d1ecf1"
        };

        status.textContent = message;
        status.style.backgroundColor = colors[type];
        status.style.display = "block";

        setTimeout(() => {
            status.style.display = "none";
        }, 3000);
    }

    // =========================================================================
    // 多API管理功能
    // =========================================================================

    createBasicSettingsHTML() {
        return `
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">${this.getText('language')}</label>
                <select id="language" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <option value="en" ${this.settings.language === 'en' ? 'selected' : ''}>🇺🇸 English</option>
                    <option value="zh-CN" ${this.settings.language === 'zh-CN' ? 'selected' : ''}>🇨🇳 中文</option>
                </select>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">${this.getText('targetLang')}</label>
                <select id="targetLang" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <option value="zh-CN" ${this.settings.targetLang === 'zh-CN' ? 'selected' : ''}>🇨🇳 ${this.getText('chinese')}</option>
                    <option value="en" ${this.settings.targetLang === 'en' ? 'selected' : ''}>🇺🇸 ${this.getText('english')}</option>
                    <option value="ja" ${this.settings.targetLang === 'ja' ? 'selected' : ''}>🇯🇵 ${this.getText('japanese')}</option>
                    <option value="ko" ${this.settings.targetLang === 'ko' ? 'selected' : ''}>🇰🇷 ${this.getText('korean')}</option>
                </select>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">${this.getText('prompt')}</label>
                <textarea id="prompt" rows="3" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; resize: vertical;">${this.settings.prompt}</textarea>
            </div>
        `;
    }

    createMultiAPIHTML() {
        let apisHTML = '';

        if (this.settings.apis.length === 0) {
            apisHTML = '<p style="color: #666; font-style: italic;">暂无保存的API配置</p>';
        } else {
            apisHTML = '<div style="margin-bottom: 15px;">';
            apisHTML += '<label style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">选择当前API:</label>';
            apisHTML += '<select id="currentApi" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">';

            this.settings.apis.forEach((api, index) => {
                const selected = index === this.settings.currentApiIndex ? 'selected' : '';
                apisHTML += `<option value="${index}" ${selected}>${api.name} (${api.model})</option>`;
            });

            apisHTML += '</select></div>';

            apisHTML += '<div style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 10px; background: white;">';
            this.settings.apis.forEach((api, index) => {
                apisHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 8px; background: #f9f9f9; border-radius: 4px;">
                        <div style="flex: 1;">
                            <strong style="color: #333;">${api.name}</strong>
                        </div>
                        <div>
                            <button class="edit-api-btn" data-index="${index}" style="margin-right: 5px; padding: 4px 8px; background: #2196f3; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">编辑</button>
                            <button class="delete-api-btn" data-index="${index}" style="padding: 4px 8px; background: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">删除</button>
                        </div>
                    </div>
                `;
            });
            apisHTML += '</div>';
        }

        // 添加平台选择和可折叠的添加按钮
        const platformSelectHTML = `
            <div style="margin-top: 15px; margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">选择平台:</label>
                <select id="platformSelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px;">
                    <option value="">自定义API</option>
                    <option value="siliconflow">硅基流动 (SiliconFlow)</option>
                    <option value="aihubmix">AIHUBMIX</option>
                    <option value="deepseek">DeepSeek</option>
                </select>
            </div>

            <div style="margin-top: 15px;">
                <button id="toggleAddApiBtn" style="width: 100%; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span id="toggleIcon">➕</span>
                    <span id="toggleText">添加新API配置</span>
                </button>
            </div>

            <!-- 隐藏的添加表单 -->
            <div id="addApiForm" style="display: none; margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef;">
                <h4 style="margin: 0 0 15px 0; color: #495057; font-size: 16px;">➕ 添加新API配置</h4>

                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 4px; font-weight: 600; color: #333; font-size: 14px;">配置名称:</label>
                    <input type="text" id="newApiName" placeholder="例如: OpenAI官方" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 4px; font-weight: 600; color: #333; font-size: 14px;">API Key:</label>
                    <input type="password" id="newApiKey" placeholder="sk-..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>

                <!-- Base URL字段 - 根据平台选择显示或隐藏 -->
                <div id="baseUrlField" style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 4px; font-weight: 600; color: #333; font-size: 14px;">Base URL:</label>
                    <input type="text" id="newBaseUrl" placeholder="https://api.openai.com/v1" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 4px; font-weight: 600; color: #333; font-size: 14px;">模型名称:</label>
                    <input type="text" id="newModel" placeholder="gpt-3.5-turbo" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>

                <div style="display: flex; gap: 8px;">
                    <button id="saveNewApiBtn" style="flex: 1; padding: 8px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 14px;">保存</button>
                    <button id="cancelAddApiBtn" style="flex: 1; padding: 8px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 14px;">取消</button>
                </div>
            </div>
        `;

        return `
            ${apisHTML}
            ${platformSelectHTML}
        `;
    }

    bindBasicSettingsEvents(panel) {
        const languageSelect = panel.querySelector("#language");
        const targetLangSelect = panel.querySelector("#targetLang");
        const promptTextarea = panel.querySelector("#prompt");

        languageSelect.onchange = () => {
            this.settings.language = languageSelect.value;
            this.saveSettings();
            // 重新渲染设置面板以更新语言
            const newPanel = this.createSettingsPanel();
            panel.parentNode.replaceChild(newPanel, panel);
        };

        targetLangSelect.onchange = () => {
            this.settings.targetLang = targetLangSelect.value;
            this.saveSettings();
            this.showStatus(panel, "目标语言已更新", "success");
        };

        promptTextarea.onblur = () => {
            this.settings.prompt = promptTextarea.value;
            this.saveSettings();
            this.showStatus(panel, "翻译提示词已更新", "success");
        };
    }

    bindMultiAPIEvents(panel) {
        // 使用setTimeout确保DOM完全渲染后再绑定事件
        setTimeout(() => {
            const currentApiSelect = panel.querySelector("#currentApi");
            if (currentApiSelect) {
                currentApiSelect.onchange = () => {
                    this.settings.currentApiIndex = parseInt(currentApiSelect.value);
                    this.saveSettings();
                    this.updateCurrentAPI();
                    this.showStatus(panel, "已切换API配置", "success");
                };
            }

            // 平台选择器
            const platformSelect = panel.querySelector("#platformSelect");
            const baseUrlField = panel.querySelector("#baseUrlField");

            if (platformSelect && baseUrlField) {
                platformSelect.onchange = () => {
                    const selectedPlatform = platformSelect.value;
                    this.settings.selectedPlatform = selectedPlatform;

                    // 根据平台选择显示/隐藏Base URL字段
                    if (selectedPlatform && this.predefinedPlatforms[selectedPlatform]) {
                        baseUrlField.style.display = 'none';
                    } else {
                        baseUrlField.style.display = 'block';
                    }
                };

                // 初始化时根据当前选择设置显示状态
                const currentValue = platformSelect.value;
                if (currentValue && this.predefinedPlatforms[currentValue]) {
                    baseUrlField.style.display = 'none';
                }
            }

            // 绑定折叠按钮
            const toggleAddApiBtn = panel.querySelector("#toggleAddApiBtn");
            const addApiForm = panel.querySelector("#addApiForm");
            const toggleIcon = panel.querySelector("#toggleIcon");
            const toggleText = panel.querySelector("#toggleText");

            if (toggleAddApiBtn) {
                toggleAddApiBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const isVisible = addApiForm.style.display !== 'none';
                    if (isVisible) {
                        // 隐藏表单
                        addApiForm.style.display = 'none';
                        if (toggleIcon) toggleIcon.textContent = '➕';
                        if (toggleText) toggleText.textContent = '添加新API配置';
                    } else {
                        // 显示表单
                        addApiForm.style.display = 'block';
                        if (toggleIcon) toggleIcon.textContent = '➖';
                        if (toggleText) toggleText.textContent = '收起添加表单';
                    }
                };
            }

            // 绑定保存和取消按钮
            const saveNewApiBtn = panel.querySelector("#saveNewApiBtn");
            const cancelAddApiBtn = panel.querySelector("#cancelAddApiBtn");

            if (saveNewApiBtn) {
                saveNewApiBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.saveNewAPIFromForm(panel);
                };
            }

            if (cancelAddApiBtn) {
                cancelAddApiBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.clearAddAPIForm(panel);
                    // 同时隐藏表单
                    if (addApiForm) addApiForm.style.display = 'none';
                    if (toggleIcon) toggleIcon.textContent = '➕';
                    if (toggleText) toggleText.textContent = '添加新API配置';
                };
            }

            panel.addEventListener("click", (e) => {
                if (e.target.classList.contains("edit-api-btn")) {
                    e.preventDefault();
                    e.stopPropagation();
                    const index = parseInt(e.target.dataset.index);
                    this.showEditFormForAPI(panel, index);
                } else if (e.target.classList.contains("delete-api-btn")) {
                    e.preventDefault();
                    e.stopPropagation();
                    const index = parseInt(e.target.dataset.index);
                    this.deleteAPI(panel, index);
                }
            });
        }, 100);
    }

    bindActionEvents(panel) {
        panel.querySelector("#testBtn").onclick = () => this.enhancedTestAPI(panel);
        panel.querySelector("#clearBtn").onclick = () => {
            this.clearAllTranslations();
            this.showStatus(panel, this.getText('clearBtn'), "success");
        };
    }

    updateCurrentAPI() {
        if (this.settings.apis.length > 0) {
            const currentAPI = this.settings.apis[this.settings.currentApiIndex];
            if (currentAPI) {
                this.settings.apiKey = currentAPI.apiKey;
                this.settings.baseUrl = currentAPI.baseUrl;
                this.settings.model = currentAPI.model;
                this.saveSettings();
            }
        }
    }

    saveNewAPIFromForm(panel) {
        const nameInput = panel.querySelector("#newApiName");
        const apiKeyInput = panel.querySelector("#newApiKey");
        const baseUrlInput = panel.querySelector("#newBaseUrl");
        const modelInput = panel.querySelector("#newModel");
        const platformSelect = panel.querySelector("#platformSelect");

        const name = nameInput ? nameInput.value.trim() : '';
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        const model = modelInput ? modelInput.value.trim() : '';
        const selectedPlatform = platformSelect ? platformSelect.value : '';

        let baseUrl = '';

        // 根据平台类型处理Base URL
        if (selectedPlatform && this.predefinedPlatforms[selectedPlatform]) {
            // 预定义平台使用内置的Base URL
            baseUrl = this.predefinedPlatforms[selectedPlatform].baseUrl;
            
        } else {
            // 自定义API需要用户提供Base URL
            baseUrl = baseUrlInput ? baseUrlInput.value.trim() : '';
        }

        // 验证必填字段
        const missingFields = [];
        if (!name) missingFields.push('配置名称');
        if (!apiKey) missingFields.push('API Key');
        if (!baseUrl) missingFields.push('Base URL');
        if (!model) missingFields.push('模型名称');

        if (missingFields.length > 0) {
            this.showStatus(panel, `❌ 请填写以下字段：${missingFields.join('、')}`, "error");
            return;
        }

        // 保存配置
        const newApi = {
            name: name,
            apiKey: apiKey,
            baseUrl: baseUrl,
            model: model,
            platform: selectedPlatform // 保存平台信息
        };

        this.settings.apis.push(newApi);
        this.saveSettings();

        // 清空表单并重置折叠状态
        this.clearAddAPIForm(panel);

        this.refreshSettingsPanel(panel);
        this.showStatus(panel, `✅ API配置 "${newApi.name}" 已添加`, "success");
    }

    clearAddAPIForm(panel) {
        const nameInput = panel.querySelector("#newApiName");
        const apiKeyInput = panel.querySelector("#newApiKey");
        const baseUrlInput = panel.querySelector("#newBaseUrl");
        const modelInput = panel.querySelector("#newModel");
        const platformSelect = panel.querySelector("#platformSelect");

        if (nameInput) nameInput.value = '';
        if (apiKeyInput) apiKeyInput.value = '';
        if (baseUrlInput) baseUrlInput.value = 'https://api.openai.com/v1';
        if (modelInput) modelInput.value = 'gpt-3.5-turbo';
        if (platformSelect) platformSelect.value = '';

        // 重置平台选择状态
        this.settings.selectedPlatform = null;

        // 重置折叠状态
        const addApiForm = panel.querySelector("#addApiForm");
        const toggleIcon = panel.querySelector("#toggleIcon");
        const toggleText = panel.querySelector("#toggleText");
        const baseUrlField = panel.querySelector("#baseUrlField");

        if (addApiForm) addApiForm.style.display = 'none';
        if (toggleIcon) toggleIcon.textContent = '➕';
        if (toggleText) toggleText.textContent = '添加新API配置';
        if (baseUrlField) baseUrlField.style.display = 'block'; // 重置为显示Base URL字段
    }

    showEditFormForAPI(panel, index) {
        const api = this.settings.apis[index];
        if (!api) {
            return;
        }

        // 检查是否已经有编辑表单
        const existingForm = panel.querySelector("#editApiForm");
        if (existingForm) {
            existingForm.remove();
        }

        // 创建编辑表单
        const editFormHTML = `
            <div id="editApiForm" style="margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 6px; border: 1px solid #ffeaa7;">
                <h4 style="margin: 0 0 15px 0; color: #856404; font-size: 16px;">✏️ 编辑API配置</h4>

                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 4px; font-weight: 600; color: #333; font-size: 14px;">配置名称:</label>
                    <input type="text" id="editApiName" value="${api.name}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 4px; font-weight: 600; color: #333; font-size: 14px;">API Key:</label>
                    <input type="password" id="editApiKey" value="${api.apiKey}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 4px; font-weight: 600; color: #333; font-size: 14px;">Base URL:</label>
                    <input type="text" id="editBaseUrl" value="${api.baseUrl}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 4px; font-weight: 600; color: #333; font-size: 14px;">模型名称:</label>
                    <input type="text" id="editModel" value="${api.model}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>

                <div style="display: flex; gap: 8px;">
                    <button id="saveEditApiBtn" data-edit-index="${index}" style="flex: 1; padding: 8px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 14px;">保存修改</button>
                    <button id="cancelEditApiBtn" style="flex: 1; padding: 8px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 14px;">取消编辑</button>
                </div>
            </div>
        `;

        // 找到多API管理区域并添加编辑表单
        const multiApiSection = panel.querySelector("#addApiForm");
        if (multiApiSection) {
            multiApiSection.insertAdjacentHTML('afterend', editFormHTML);
        }

        // 绑定编辑表单的事件
        setTimeout(() => {
            const saveEditBtn = panel.querySelector("#saveEditApiBtn");
            const cancelEditBtn = panel.querySelector("#cancelEditApiBtn");

            if (saveEditBtn) {
                saveEditBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const editIndex = parseInt(saveEditBtn.dataset.editIndex);
                    this.saveEditedAPIFromForm(panel, editIndex);
                };
            }

            if (cancelEditBtn) {
                cancelEditBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const editForm = panel.querySelector("#editApiForm");
                    if (editForm) editForm.remove();
                };
            }
        }, 100);
    }

    saveEditedAPIFromForm(panel, index) {
        const nameInput = panel.querySelector("#editApiName");
        const apiKeyInput = panel.querySelector("#editApiKey");
        const baseUrlInput = panel.querySelector("#editBaseUrl");
        const modelInput = panel.querySelector("#editModel");

        const name = nameInput ? nameInput.value.trim() : '';
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        const baseUrl = baseUrlInput ? baseUrlInput.value.trim() : '';
        const model = modelInput ? modelInput.value.trim() : '';

        if (!name || !apiKey || !baseUrl || !model) {
            const missingFields = [];
            if (!name) missingFields.push('配置名称');
            if (!apiKey) missingFields.push('API Key');
            if (!baseUrl) missingFields.push('Base URL');
            if (!model) missingFields.push('模型名称');

            this.showStatus(panel, `❌ 请填写以下字段：${missingFields.join('、')}`, "error");
            return;
        }

        // 保存配置
        this.settings.apis[index] = {
            name: name,
            apiKey: apiKey,
            baseUrl: baseUrl,
            model: model
        };

        this.saveSettings();

        // 移除编辑表单
        const editForm = panel.querySelector("#editApiForm");
        if (editForm) editForm.remove();

        this.refreshSettingsPanel(panel);
        this.showStatus(panel, `✅ API配置 "${name}" 已更新`, "success");
    }

    deleteAPI(panel, index) {
        if (confirm("确定要删除这个API配置吗？")) {
            this.settings.apis.splice(index, 1);

            // 调整当前API索引
            if (this.settings.currentApiIndex >= this.settings.apis.length) {
                this.settings.currentApiIndex = Math.max(0, this.settings.apis.length - 1);
            }

            this.saveSettings();
            this.updateCurrentAPI();
            this.refreshSettingsPanel(panel);
            this.showStatus(panel, "API配置已删除", "success");
        }
    }

    refreshSettingsPanel(panel) {
        const newPanel = this.createSettingsPanel();
        panel.parentNode.replaceChild(newPanel, panel);
    }

    

    // =========================================================================
    // 增强错误提示功能
    // =========================================================================

    async enhancedTestAPI(panel) {
        try {
            // 显示测试状态并保持显示
            this.showPersistentStatus(panel, "🔍 正在测试API连接...", "info");

            const testText = "Hello, this is a test message.";
            const result = await this.enhancedCallAPI(testText);

            // 测试成功，显示结果
            this.showPersistentStatus(panel, `✅ 测试成功！翻译结果: "${result}"`, "success");

            // 3秒后清除状态
            setTimeout(() => {
                this.clearStatus(panel);
            }, 3000);

        } catch (error) {
            console.error("API测试失败:", error);
            // 显示详细错误信息
            this.showDetailedError(panel, error);
        }
    }

    async enhancedCallAPI(text) {
        const { apiKey, baseUrl, model } = this.settings;

        if (!apiKey || !baseUrl || !model) {
            throw new Error("API配置不完整：请检查API Key、Base URL和模型设置");
        }

        // 验证URL格式
        try {
            new URL(baseUrl);
        } catch (e) {
            throw new Error(`Base URL格式无效: "${baseUrl}"。请确保是完整的URL，例如 https://api.openai.com/v1`);
        }

        const prompt = this.settings.prompt
            .replace("{targetLang}", this.settings.targetLang)
            .replace("{text}", text);

        // 直接使用用户提供的完整URL，不自动补全路径
        let requestUrl = baseUrl;

        const startTime = Date.now();

        try {
            const response = await fetch(requestUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 1000,
                    temperature: 0.3
                })
            });

            const responseTime = Date.now() - startTime;

            if (!response.ok) {
                let errorDetails = `HTTP ${response.status}: ${response.statusText}`;

                try {
                    const errorText = await response.text();
                    console.error("🔍 错误响应内容:", errorText);

                    // 尝试解析JSON错误
                    try {
                        const errorJson = JSON.parse(errorText);
                        if (errorJson.error) {
                            errorDetails += `\n错误详情: ${errorJson.error.message || JSON.stringify(errorJson.error)}`;
                        }
                    } catch (parseError) {
                        // 如果不是JSON，直接显示文本
                        if (errorText) {
                            errorDetails += `\n响应内容: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`;
                        }
                    }
                } catch (textError) {
                    errorDetails += `\n无法读取错误详情`;
                }

                // 常见错误诊断
                if (response.status === 401) {
                    errorDetails += "\n💡 建议检查: API Key是否正确";
                } else if (response.status === 403) {
                    errorDetails += "\n💡 建议检查: API Key权限是否足够，或账户是否有余额";
                } else if (response.status === 404) {
                    errorDetails += "\n💡 建议检查: Base URL和模型名称是否正确";
                } else if (response.status === 429) {
                    errorDetails += "\n💡 建议检查: 是否超过API速率限制，稍后再试";
                } else if (response.status >= 500) {
                    errorDetails += "\n💡 服务器错误，请稍后重试或联系API提供商";
                }

                throw new Error(errorDetails);
            }

            const data = await response.json();
            

            let result = null;

            // 多种方式提取结果
            if (data.choices && data.choices.length > 0) {
                const choice = data.choices[0];
                if (choice.message && typeof choice.message.content === 'string') {
                    result = choice.message.content.trim();
                    
                } else if (choice.text && typeof choice.text === 'string') {
                    result = choice.text.trim();
                    
                }
            }

            if (!result) {
                const fields = ['result', 'output', 'response', 'answer', 'translation', 'text', 'content'];
                for (const field of fields) {
                    if (data[field] && typeof data[field] === 'string' && data[field].trim()) {
                        result = data[field].trim();
                        
                        break;
                    }
                }
            }

            if (!result && typeof data === 'string' && data.trim()) {
                result = data.trim();
                
            }

            if (!result) {
                console.error('❌ 完整响应数据:', JSON.stringify(data, null, 2));
                throw new Error(`API响应格式异常：无法从响应中提取翻译结果。响应结构: ${Object.keys(data).join(', ')}`);
            }

            // 验证结果质量
            if (result.toLowerCase() === 'null' || result.toLowerCase() === 'undefined' || result.toLowerCase() === 'error') {
                throw new Error(`翻译结果无效: "${result}"。这通常表示API调用有问题，请检查配置。`);
            }

            if (result.length === 0) {
                throw new Error('API返回了空结果。这可能表示提示词有问题或模型不支持该任务。');
            }

            
            return result;

        } catch (networkError) {
            if (networkError.message.includes('fetch')) {
                throw new Error(`网络连接失败: ${networkError.message}\n💡 建议检查: 网络连接、Base URL是否可访问、是否有防火墙阻挡`);
            }
            throw networkError;
        }
    }

    showPersistentStatus(panel, message, type = "info") {
        const status = panel.querySelector("#status");
        const colors = {
            success: { bg: "#d4edda", border: "#c3e6cb", color: "#155724" },
            error: { bg: "#f8d7da", border: "#f5c6cb", color: "#721c24" },
            info: { bg: "#d1ecf1", border: "#bee5eb", color: "#0c5460" }
        };

        status.textContent = message;
        status.style.backgroundColor = colors[type].bg;
        status.style.border = `1px solid ${colors[type].border}`;
        status.style.color = colors[type].color;
        status.style.display = "block";

        // 对于info类型（测试中），不自动隐藏
        if (type !== "info") {
            setTimeout(() => {
                this.clearStatus(panel);
            }, 3000);
        }
    }

    clearStatus(panel) {
        const status = panel.querySelector("#status");
        if (status) {
            status.style.display = "none";
            status.textContent = "";
        }
    }

    showDetailedError(panel, error) {
        const status = panel.querySelector("#status");
        status.innerHTML = `
            <div style="color: #d32f2f; font-weight: 600; margin-bottom: 8px;">❌ API测试失败</div>
            <div style="color: #666; font-size: 12px; line-height: 1.4; white-space: pre-line;">${error.message}</div>
        `;
        status.style.backgroundColor = "#ffebee";
        status.style.border = "1px solid #f44336";
        status.style.display = "block";

        // 延长显示时间，让用户有时间查看详细错误
        setTimeout(() => {
            this.clearStatus(panel);
        }, 10000);
    }
};
