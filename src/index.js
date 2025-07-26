// Cloudflare Workers用エントリーポイント
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // TwiML webhookルートの処理
    if (path === '/webhook/twiml' || path.startsWith('/webhook/twiml/')) {
      return handleTwimlRequest(request, env);
    }

    // WebSocketアップグレードの処理
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      return handleWebSocketUpgrade(request, env);
    }

    // 情報確認用のGETリクエスト処理
    //  1. エンドポイントの動作確認 - WebSocketエンドポイントが正常に動作しているかブラウザで簡単にチェック
    //  2. 開発時のテスト - curlやブラウザでGET https://your-domain/faqにアクセスして応答を確認
    //  3. ドキュメント代わり - どのエンドポイントが利用可能かの情報提供
    if (request.method === 'GET' && (path === '/faq' || path === '/translator-en-jp' || path === '/translator-jp-en')) {
      return new Response(`WebSocket endpoint: ${path}\nConnect via WebSocket for interactive chat.`, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

// TwiML webhookハンドラー
// TwilioからのPOSTリクエストを処理し、ConversationRelay用のTwiMLレスポンスを生成
async function handleTwimlRequest(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  
  // リクエストからサーバーURLを動的に取得
  const requestUrl = new URL(request.url);
  const protocol = 'wss';
  const host = requestUrl.host;
  const serverUrl = `${protocol}://${host}`;

  // プリセットルートの処理 (/webhook/twiml/faq など)
  if (path.match(/^\/webhook\/twiml\/(.+)$/)) {
    const preset = path.split('/').pop();
    return handlePresetTwiml(preset, serverUrl);
  }

  // クエリパラメータによるカスタム設定の処理
  const params = Object.fromEntries(url.searchParams);
  return handleQueryTwiml(params, serverUrl);
}

// プリセット設定に基づくTwiMLレスポンス生成
function handlePresetTwiml(preset, serverUrl) {
  const presets = {
    // 英語→日本語翻訳設定
    'translator-en-jp': {
      url: `${serverUrl}/translator-en-jp`,
      language: 'en-US', // 音声認識言語
      welcomeGreeting: 'こんにちは。英語を日本語に翻訳する通訳です。英語でお話頂ければ日本で翻訳します。',
      ttsLanguage: 'ja-JP', // 音声合成言語
      ttsProvider: 'Google',
      voice: 'ja-JP-Chirp3-HD-Aoede' // 音声の種類
    },
    // 日本語→英語翻訳設定
    'translator-jp-en': {
      url: `${serverUrl}/translator-jp-en`,
      language: 'ja-JP',
      welcomeGreeting: 'Hello. I am an interpreter who translates Japanese into English. Please speak in Japanese.',
      ttsLanguage: 'en-US',
      ttsProvider: 'Google',
      voice: 'en-US-Journey-F'
    },
    // FAQ対応設定
    'faq': {
      url: `${serverUrl}/faq`,
      language: 'ja-JP',
      welcomeGreeting: 'よくある質問にお答えします。ご質問をどうぞ。',
      ttsLanguage: 'ja-JP',
      ttsProvider: 'Google',
      voice: 'ja-JP-Chirp3-HD-Aoede'
    }
  };

  const config = presets[preset] || presets['translator-en-jp'];
  return createTwimlResponse(config);
}

// クエリパラメータに基づくTwiMLレスポンス生成
function handleQueryTwiml(params, serverUrl) {
  const config = {
    url: params.url || `${serverUrl}/translator-en-jp`,
    language: params.language || 'en-US',
    welcomeGreeting: params.welcomeGreeting || 'こんにちは。英語を日本語に翻訳する通訳です。英語でお話頂ければ日本で翻訳します。',
    ttsLanguage: params.ttsLanguage || 'ja-JP',
    ttsProvider: params.ttsProvider || 'Google',
    voice: params.voice || 'ja-JP-Chirp3-HD-Aoede'
  };
  return createTwimlResponse(config);
}

// TwiML XMLレスポンスの生成
function createTwimlResponse(config) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay 
      url="${config.url}" 
      language="${config.language}" 
      welcomeGreeting="${config.welcomeGreeting}" 
      ttsLanguage="${config.ttsLanguage}" 
      ttsProvider="${config.ttsProvider}" 
      voice="${config.voice}" />
  </Connect>
</Response>`;

  return new Response(twiml, {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}

// WebSocketアップグレードハンドラー
// クライアントとのWebSocket接続を確立
async function handleWebSocketUpgrade(request, env) {
  // WebSocketペアの作成
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  const url = new URL(request.url);
  const pathname = url.pathname;

  // パスに基づいてシステムプロンプトを取得
  const systemPrompt = getSystemPrompt(pathname, env);
  
  // WebSocket接続の処理を開始
  server.accept();
  handleWebSocket(server, systemPrompt, env);

  // 101 Switching Protocolsレスポンスを返す
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

// URLパスに基づいてシステムプロンプトを取得
function getSystemPrompt(pathname, env) {
  let systemPrompt = 'あなたは親切なアシスタントです。'; // デフォルト

  // 各エンドポイントに対応するシステムプロンプトを環境変数から取得
  if (pathname === '/translator-en-jp') {
    systemPrompt = env.SYSTEM_PROMPT_TRANSLATOR_EN_JP || systemPrompt;
  } else if (pathname === '/translator-jp-en') {
    systemPrompt = env.SYSTEM_PROMPT_TRANSLATOR_JP_EN || systemPrompt;
  } else if (pathname === '/faq') {
    systemPrompt = env.SYSTEM_PROMPT_FAQ || systemPrompt;
  } else if (pathname === '/order') {
    systemPrompt = env.SYSTEM_PROMPT_ORDER || systemPrompt;
  } else if (pathname === '/booking') {
    systemPrompt = env.SYSTEM_PROMPT_BOOKING || systemPrompt;
  }

  return systemPrompt;
}

// WebSocket接続のメインハンドラー
async function handleWebSocket(ws, systemPrompt, env) {
  // 会話履歴の初期化（システムプロンプトを含む）
  let conversationHistory = [
    { role: 'system', content: systemPrompt }
  ];

  // メッセージ受信時の処理
  ws.addEventListener('message', async (event) => {
    try {
      const message = JSON.parse(event.data);
      
      // セットアップメッセージの処理
      if (message.type === 'setup') {
        console.log('WebSocket setup complete');
      } else if (message.type === 'prompt') {
        // ユーザーの音声入力テキストを取得
        const userInput = message.voicePrompt;
        conversationHistory.push({ role: 'user', content: userInput });

        // OpenAI APIキーの確認
        if (!env.OPENAI_API_KEY) {
          console.error('ERROR: OPENAI_API_KEY not configured');
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'API key not configured' 
          }));
          return;
        }

        console.log('DEBUG: Making OpenAI API call with model gpt-4o-mini');
        
        // OpenAI APIへのストリーミングリクエスト
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: conversationHistory,
            stream: true, // ストリーミングモードを有効化
            temperature: 0.7, // 応答の創造性（0-1）
            max_tokens: 150, // 最大トークン数
          }),
        });

        // エラーレスポンスの処理
        if (!response.ok) {
          console.error('ERROR: OpenAI API error:', response.status, response.statusText);
          const errorBody = await response.text();
          console.error('ERROR: OpenAI API error body:', errorBody);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: `OpenAI API error: ${response.status}` 
          }));
          return;
        }

        // ストリーミングレスポンスの処理
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; // 文章の一時バッファ
        let fullResponse = ''; // 完全なレスポンステキスト
        let partialChunk = ''; // 不完全な行の保存用
        const delimiter = /(?<=[。、？])/; // 日本語の文章区切り文字

        console.log('DEBUG: Starting to process OpenAI streaming response');

        // ストリーミングデータの読み取りループ
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // UTF-8デコード（ストリーミングモードで部分的なバイトを保持）
          const chunk = decoder.decode(value, {stream: true});
          const allData = partialChunk + chunk;
          const lines = allData.split('\n');
          
          // 最後の行が不完全な場合は次のチャンクまで保持
          partialChunk = lines.pop() || '';

          // 各行の処理
          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              // ストリーミング終了マーカー
              if (data === '[DONE]') {
                console.log('DEBUG: OpenAI stream completed');
                continue;
              }

              try {
                // JSONデータのパース
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content;
                if (content) {
                  buffer += content;
                  fullResponse += content;
                  
                  // 文章区切りで分割
                  const sentences = buffer.split(delimiter);
                  // 最後の不完全な文章は次回のために保持
                  buffer = sentences.pop() || '';
                  
                  // 完成した文章を送信
                  for (const sentence of sentences) {
                    console.log("DEBUG: Sending sentence to client:", sentence);
                    ws.send(JSON.stringify({ 
                      type: 'text', 
                      token: sentence, 
                      last: false 
                    }));
                  }
                }
              } catch (e) {
                // 不正なJSONは無視（部分的なチャンクの可能性）
                continue;
              }
            }
          }
        }

        // 残りのバッファを送信
        if (buffer) {
          console.log("DEBUG: Sending final buffer:", buffer);
          ws.send(JSON.stringify({ 
            type: 'text', 
            token: buffer, 
            last: true // 最後のトークンフラグ
          }));
        }

        console.log('DEBUG: Complete AI response:', fullResponse);
        // 会話履歴にAIの応答を追加
        conversationHistory.push({ role: 'assistant', content: fullResponse });
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  // 接続クローズ時の処理
  ws.addEventListener('close', () => {
    console.log('WebSocket connection closed');
  });
}