import React, { createContext, PropsWithChildren, useContext, useState } from 'react';
import { CreateMessage, Message } from 'ai/react';
import { nanoid } from 'nanoid';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { ollama, createOllama } from 'ollama-ai-provider';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { CallWarning, convertToCoreMessages, FinishReason, streamText } from 'ai';
import { ConfigContext } from '@/contexts/config-context';
import { toast } from 'sonner';
import { Record } from '@/data/client/models';
import { StatDTO, AggregatedStatsDTO } from '@/data/dto';
import { AggregatedStatsResponse, AggregateStatResponse, StatApiClient } from '@/data/client/stat-api-client';
import { DatabaseContext } from './db-context';
import { findCodeBlocks, getErrorMessage } from '@/lib/utils';
import { SaaSContext } from './saas-context';
import { prompts } from '@/data/ai/prompts';
import { jsonrepair } from 'jsonrepair';
import { json } from 'stream/consumers';
import showdown from 'showdown';
import { set } from 'date-fns';

export enum MessageDisplayMode {
    Text = 'text',
    InternalJSONRequest = 'internalJSONRequest',
    InternalJSONResponse= 'internalJSONResponse',
    JSONAgentReponse = 'jsonAgentResponse'
}

export enum MessageVisibility {
    Hidden = 'hidden',
    Visible = 'visible',
    VisibleWhenFinished = 'visibleWhenFinished',
    ProgressWhileStreaming = 'progressWhileStreaming'
}

export type MessageAction = {
    displayMode: string;
    type: string;
    params: any;
}

export enum MessageType {
    Chat = 'chat',
    Parse = 'parse',
    SafetyMessage = 'safetyMessage'
}

export type AgentContext ={
    displayName: string;
    type: string;
    crossCheckEnabled:boolean;
    agentFinishMessage?: string;
    agentFinishDialog?: boolean;
    onMessageAction?: (messageAction:MessageAction, message:Message) => void;
    onAgentFinished?: (messageAction:MessageAction, lastMessage:Message) => void;
}

export type MessageEx = Message & {
    prev_sent_attachments?: Attachment[];
    displayMode?: MessageDisplayMode,
    messageAction?: { displayMode: string, type: string, params: any },
    finished?: boolean

    type?: MessageType,
    visibility?: MessageVisibility

    recordRef?: Record
    recordSaved?: boolean
}

export type CreateMessageEx = Omit<MessageEx, "id">;

export type AIResultEventType = {
    finishReason: FinishReason;
    usage: any;
    text: string;
    toolCalls?: {
        type: "tool-call";
        toolCallId: string;
        toolName: string;
        args: any;
    }[] | undefined;
    toolResults?: never[] | undefined;
    rawResponse?: {
        headers?: Record<string, string>;
    };
    warnings?: CallWarning[];
}
export type OnResultCallback = (result: MessageEx, eventData: AIResultEventType) => void;

export type CreateMessageEnvelope = {
    message: CreateMessageEx;
    providerName?: string;
    modelName?: string;
    onResult?: OnResultCallback
}
export type CreateMessagesEnvelope = {
    messages: CreateMessageEx[];
    providerName?: string;
    modelName?: string;
    onResult?: OnResultCallback
}

export type CrossCheckResultType = {
    risk: string;
    validity: string;
    explanation: string;
    nextQuestion: string;
    answer: string;
}

export type ChatContextType = {
    messages: MessageEx[];
    visibleMessages: MessageEx[];
    lastMessage: MessageEx | null;
    providerName?: string;
    areRecordsLoaded: boolean;
    crossCheckResult: CrossCheckResultType | null;
    setCrosscheckAnswers: (value: boolean) => void;
    crosscheckAnswers: boolean;
    setCrosscheckModel: (value: string) => void;
    crosscheckModel: string;
    setCrosscheckProvider: (value: string) => void;
    crosscheckProvider: string;
    newChat(): void; 
    downloadMessage: (message: MessageEx, filename: string, format: string) => void;
    startAgent: (agentContext: AgentContext, prompt: string, initialMessages: MessageEx[]) => void;
    stopAgent: () => void;
    setCrossCheckResult: (value: CrossCheckResultType | null) => void;
    agentContext: AgentContext | null;
    setAgentContext: (value: AgentContext) => void;
    setRecordsLoaded: (value: boolean) => void;
    aiDirectCall: (messages: MessageEx[], onResult?: OnResultCallback, providerName?: string, modelName?: string) => void;
    aiDirectCallStream: (messages: MessageEx[], onResult?: OnResultCallback, providerName?: string, modelName?: string) => AsyncGenerator<string>;
    sendMessage: (msg: CreateMessageEnvelope, includeExistingMessagesAsContext?: boolean) => void;
    sendMessages: (msg: CreateMessagesEnvelope, includeExistingMessagesAsContext?: boolean) => void;
    autoCheck: (messages: MessageEx[], providerName?: string, modelName?: string) => void;
    agentFinishedDialogOpen: boolean;
    setAgentFinishedDialogOpen: (open: boolean) => void;
    agentFinishMessage: string;
    chatOpen: boolean,
    setChatOpen: (value: boolean) => void;
    chatCustomPromptVisible: boolean;
    setChatCustomPromptVisible: (value: boolean) => void;
    chatTemplatePromptVisible: boolean;
    setTemplatePromptVisible: (value: boolean) => void;
    isStreaming: boolean;
    isCrossChecking: boolean;
    checkApiConfig: () => Promise<boolean>;
    promptTemplate: string;
    setPromptTemplate: (value: string) => void;
    statsPopupOpen: boolean;
    setStatsPopupOpen: (open: boolean) => void;
    aggregateStats: (newItem: StatDTO) => Promise<StatDTO>;
    lastRequestStat: StatDTO|null;
    aggregatedStats: () => Promise<AggregatedStatsDTO>;
};

// Create the chat context
export const ChatContext = createContext<ChatContextType>({
    messages: [],
    visibleMessages: [],
    lastMessage: null,
    providerName: '',
    newChat: () => {},
    downloadMessage: (message: MessageEx, filename: string = message.id, format: string = 'html') => {},
    startAgent: (agentContext: AgentContext, prompt: string, initialMessages: MessageEx[]) => {},
    stopAgent: () => {},
    crosscheckAnswers: true,
    setCrosscheckAnswers: (value: boolean) => {},
    crosscheckModel: 'chatgpt-4o-latest',
    setCrosscheckModel: (value: string) => {},
    crosscheckProvider: 'chatgpt',
    setCrosscheckProvider: (value: string) => {},
    crossCheckResult: null,
    setCrossCheckResult: (value: CrossCheckResultType | null) => {},
    areRecordsLoaded: false,
    agentContext: null,
    setAgentContext: (value: AgentContext) => {},
    setRecordsLoaded: (value: boolean) => {},
    aiDirectCall: (messages: MessageEx[], onResult?: OnResultCallback, providerName?: string, modelName?: string) => {},
    aiDirectCallStream: (messages: MessageEx[], onResult?: OnResultCallback, providerName?: string, modelName?: string) => {},
    autoCheck: (messages: MessageEx[], providerName?, modelName?: string) => {},
    sendMessage: (msg: CreateMessageEnvelope, includeExistingMessagesAsContext: boolean = true) => {},
    sendMessages: (msg: CreateMessagesEnvelope, includeExistingMessagesAsContext: boolean = true) => {},
    chatOpen: false,
    agentFinishedDialogOpen: false,
    setAgentFinishedDialogOpen: (open: boolean) => {},
    agentFinishMessage: '',
    setChatOpen: (value: boolean) => {},
    isStreaming: false,
    isCrossChecking: false,
    checkApiConfig: async () => { return false },
    chatCustomPromptVisible: false,
    setChatCustomPromptVisible: (value: boolean) => {},
    chatTemplatePromptVisible: false,
    setTemplatePromptVisible: (value: boolean) => {},
    promptTemplate: '',
    setPromptTemplate: (value: string) => {},
    statsPopupOpen: false,
    setStatsPopupOpen: (open: boolean) => {},
    aggregateStats: async (newItem) => { return Promise.resolve(newItem); },
    lastRequestStat: null,
    aggregatedStats: async () => { return Promise.resolve({} as AggregatedStatsDTO); }

});

// Custom hook to access the chat context
export const useChatContext = () => useContext(ChatContext);

// Chat context provider component
export const ChatContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
    
    const [ messages, setMessages ] = useState([
        { role: 'user', name: 'You', content: 'Hi there! I will send in this conversation some medical records, please help me understand it and answer the questions. Because you are not a real phisican, never suggest diagnosis or non OTC medicaments. Please provide sources and links where suitable.', visibility: MessageVisibility.Visible } as MessageEx,
//        { role: 'assistant', name: 'AI', content: 'Sure! I will do my best to answer all your questions specifically to your records' }
    ] as MessageEx[]);
    const [visibleMessages, setVisibleMessages] = useState<MessageEx[]>(messages);
    const [lastMessage, setLastMessage] = useState<MessageEx | null>(null);
    const [providerName, setProviderName] = useState('');
    const [chatOpen, setChatOpen] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isCrossChecking, setIsCrossChecking] = useState(false);
    const [crossCheckResult, setCrossCheckResult] = useState<CrossCheckResultType | null>(null);
    const [crosscheckAnswers, setCrosscheckAnswers] = useState(process.env.NEXT_PUBLIC_CHAT_CROSSCHECK_DISABLE ? false : true);
    const [crosscheckModel, setCrosscheckModel] = useState('chatgpt-4o-latest');
    const [crosscheckProvider, setCrosscheckProvider] = useState('chatgpt');

    const [areRecordsLoaded, setRecordsLoaded] = useState(false);
    const [chatCustomPromptVisible, setChatCustomPromptVisible] = useState(false);
    const [chatTemplatePromptVisible, setTemplatePromptVisible] = useState(false);
    const [promptTemplate, setPromptTemplate] = useState('');
    const [statsPopupOpen, setStatsPopupOpen] = useState(false);
    const [lastRequestStat, setLastRequestStat] = useState<StatDTO | null>(null);
    const [agentContext, setAgentContext] = useState<AgentContext | null>(null);

    const [agentFinishedDialogOpen, setAgentFinishedDialogOpen] = useState(false);
    const [agentFinishMessage, setAgentFinishMessage] = useState('');


    const dbContext = useContext(DatabaseContext);
    const saasContext = useContext(SaaSContext);
    const config = useContext(ConfigContext);
    const checkApiConfig = async (): Promise<boolean> => {
        const apiKey = await config?.getServerConfig('chatGptApiKey') as string;
        if (!apiKey) {
            config?.setConfigDialogOpen(true);
            toast.info('Please enter Chat GPT API Key first');
            return false;
        } else return true;
    }

    const downloadMessage = (message: MessageEx, filename = message.id, format = 'html') => {

        if (format === 'html') {
            const converter = new showdown.Converter({ tables: true, completeHTMLDocument: true, openLinksInNewWindow: true });
            converter.setFlavor('github');
            const htmlContent = converter.makeHtml(message.content);
            const htmlElement = document.createElement('a');
            const fileHtml = new Blob([htmlContent], { type: 'text/html' });
            htmlElement.href = URL.createObjectURL(fileHtml);
            htmlElement.download = filename + `.html`;
            document.body.appendChild(htmlElement);
            htmlElement.click();
            document.body.removeChild(htmlElement);
        }  else {
            const mdElement = document.createElement('a');
            const file = new Blob([message.content], { type: 'text/markdown' });
            mdElement.href = URL.createObjectURL(file);
            mdElement.download = filename + `.md`;
            document.body.appendChild(mdElement);
            mdElement.click();
            document.body.removeChild(mdElement);        
        }
    }

    const newChat = (templateMessages:MessageEx[] = [
        { role: 'user', name: 'You', content: 'Hi there! I will send in this conversation some medical records, please help me understand it and answer the questions. Because you are not a real phisican, never suggest diagnosis or non OTC medicaments. Please provide sources and links where suitable.', visibility: MessageVisibility.Hidden } as MessageEx
    ]) => { 
        setAgentFinishedDialogOpen(false);
        setAgentContext(null);
        setMessages(prvMessages=> [...templateMessages]);
        setVisibleMessages(prvMessages => [...filterVisibleMessages(templateMessages)]);
        setCrossCheckResult(null);
        setRecordsLoaded(false);
    }


    const filterVisibleMessages = (messages: MessageEx[]): MessageEx[] => {
        return [...messages.filter(msg => { // display only visible messages
            return (msg.visibility !== MessageVisibility.Hidden && 
                  (msg.visibility === MessageVisibility.Visible || msg.visibility === MessageVisibility.ProgressWhileStreaming) || (msg.visibility === MessageVisibility.VisibleWhenFinished && msg.finished == true))
        })];
    }

    const aiProvider = async (providerName:string = '', modelName:string = '') => {
        await checkApiConfig();

        if (!providerName) {
            providerName = await config?.getServerConfig('llmProviderChat') as string;
        }


        setProviderName(providerName);

        console.log('AI Provider: ', providerName, modelName);

        if (providerName === 'ollama') {
            let ollamaBaseUrl = await config?.getServerConfig('ollamaUrl') as string;
            let ollamaCredentials:string[] = []
            const urlSchema = ollamaBaseUrl.indexOf('https://') > -1 ? 'https://' : 'http://';
            ollamaBaseUrl = ollamaBaseUrl.replace(urlSchema, '');

            if (ollamaBaseUrl.indexOf('@') > -1) {
                const urlArray = ollamaBaseUrl.split('@')
                ollamaBaseUrl = urlArray[1];
                ollamaCredentials = urlArray[0].split(':');
            }
            const aiProvider = createOllama({
                baseURL: urlSchema + ollamaBaseUrl,
                headers: ollamaCredentials.length > 0 ? {
                    Authorization: `Basic ${btoa(ollamaCredentials[0] + ':' + ollamaCredentials[1])}`
                }: {}
            });
            return aiProvider.chat(modelName ? modelName : await config?.getServerConfig('ollamaModel') as string);
        } else if (providerName === 'chatgpt'){
            const aiProvider = createOpenAI({
                compatibility: 'strict',
                apiKey: await config?.getServerConfig('chatGptApiKey') as string
            })
            return aiProvider.chat(modelName ? modelName : 'chatgpt-4o-latest')   //gpt-4o-2024-05-13
        } else if (providerName === 'gemini') {
            const aiProvider = createGoogleGenerativeAI({                
                apiKey: await config?.getServerConfig('geminiApiKey') as string
            })
            return aiProvider.chat(modelName ? modelName : 'gemini-2.5-pro-preview-05-06')
        } else {
            toast.error('Unknown AI provider ' + providerName);
            throw new Error('Unknown AI provider ' + providerName);
        }
    }

    /** make the auto check call to a different model */
    const aiDirectCall = async (messages: MessageEx[], onResult?: OnResultCallback, providerName?: string, modelName?: string) => {
        try {
            let messagesToSend = messages;
            const resultMessage:MessageEx = {
                id: nanoid(),
                content: '',
                createdAt: new Date(),
                role: 'assistant',
                visibility: MessageVisibility.Visible
            }            
            const result = await streamText({
                model: await aiProvider(providerName, modelName),
                messages: convertToCoreMessages(messagesToSend),
                temperature: process.env.NEXT_PUBLIC_CHAT_TEMPERATURE && modelName !== 'o1' ? parseFloat(process.env.NEXT_PUBLIC_CHAT_TEMPERATURE) : 1.0,
//                maxTokens: process.env.NEXT_PUBLIC_MAX_OUTPUT_TOKENS ? parseInt(process.env.NEXT_PUBLIC_MAX_OUTPUT_TOKENS) : 4096 * 2, - there's a config discrepancy with o3
                onFinish: async (e) =>  {
                    resultMessage.finished = true;
                    setIsCrossChecking(false);
                    if (onResult) onResult(resultMessage, e);
                }
            });
            

            for await (const delta of result.textStream) {
                resultMessage.content += delta;
            }
        } catch (e) {
            const errMsg = 'Error while streaming AI Auto Check response: ' + e;
            toast.error(errMsg);
        }

    }

    /** make the auto check call to a different model */
    async function* aiDirectCallStream(messages: MessageEx[], onResult?: OnResultCallback, providerName?: string, modelName?: string): AsyncGenerator<string> {
        try {
            let messagesToSend = messages;
            const resultMessage: MessageEx = {
                id: nanoid(),
                content: '',
                createdAt: new Date(),
                role: 'assistant',
                visibility: MessageVisibility.Visible
            };
            const result = await streamText({
                model: await aiProvider(providerName, modelName),
                messages: convertToCoreMessages(messagesToSend),
                temperature: process.env.NEXT_PUBLIC_CHAT_TEMPERATURE && modelName !== 'o1' ? parseFloat(process.env.NEXT_PUBLIC_CHAT_TEMPERATURE) : 1.0,
                onFinish: async (e) => {
                    resultMessage.finished = true;
                    setIsCrossChecking(false);
                    if (onResult) onResult(resultMessage, e);
                }
            });

            for await (const delta of result.textStream) {
                resultMessage.content += delta;
                yield delta; // Yield each delta as it arrives
            }
        } catch (e) {
            const errMsg = 'Error while streaming AI Auto Check response: ' + e;
            toast.error(errMsg);
            throw e; // Optionally rethrow for consumer to handle
        }
    }

    const stopAgent = () => {
        setAgentContext(null);
    }
    const startAgent = (agentContext: AgentContext, prompt: string, initialMessages: MessageEx[] = []) => {
        newChat();
        setAgentContext(agentContext);
        setAgentFinishMessage(agentContext.agentFinishMessage ? agentContext.agentFinishMessage : '');
        sendMessages({
            messages: [...initialMessages, {
              role: 'user',
              visibility: MessageVisibility.Hidden,
              createdAt: new Date(),
              content: prompt
            }]
          }, false /** do not send existing messages */);   
        setAgentFinishedDialogOpen(false)
        setCrossCheckResult(null);
        setTemplatePromptVisible(false);
        setChatCustomPromptVisible(true)
        setChatOpen(true);        
    }

    const autoCheck = async (messages: MessageEx[], providerName: string = crosscheckProvider, modelName:string =  crosscheckModel) => {
        setCrossCheckResult(null);
        if (agentContext?.crossCheckEnabled === false) return; // do not do crosscheck when agent context is enabled
        messages.push({
                content: prompts.autoCheck({}),
                role: 'user',
                id: nanoid(),
            } as MessageEx            
        )
        setIsCrossChecking(true);
        aiDirectCall(messages, (result, eventData) => {
            try {
                if (result.content.indexOf('```json') > -1) {
                    const codeBlocks = findCodeBlocks(result.content);
                    if (codeBlocks.blocks.length > 0) {
                        for (const block of codeBlocks.blocks) {
                            if (block.syntax === 'json') {
                                const jsonObject = JSON.parse(jsonrepair(block.code));
                                setCrossCheckResult(jsonObject as CrossCheckResultType);
                            }
                        }
                    }
                } else {
                    const jsonResult = JSON.parse(result.content);
                    setCrossCheckResult(jsonResult as CrossCheckResultType);
                }
            } catch (e) {
                console.error(e);
//                toast.error('Error parsing the auto check result: ' + result.content);
            setCrossCheckResult({
                    risk: 'yellow',
                    validity: 'yellow',
                    nextQuestion: '',
                    answer: '',
                    explanation:  result.content
                });
            }
        }, providerName, modelName); // TODO: add an option to auto check with different models
    }

    /// TODO: instead of actions we could process tool calls but actually it didn't matter that much
    const processMessageAction = (jsonObject: MessageAction, resultMessage: MessageEx) => {
        if (agentContext?.onMessageAction) agentContext.onMessageAction(jsonObject, resultMessage);
        if (jsonObject.type === 'agentExit') {
            if (agentContext?.agentFinishMessage) setAgentFinishMessage(agentContext?.agentFinishMessage);
            if (agentContext?.onAgentFinished) agentContext.onAgentFinished(jsonObject, resultMessage);
            if (agentContext?.agentFinishDialog) setAgentFinishedDialogOpen(true);
            stopAgent();
        }
        if(jsonObject.type === 'meta') {
            resultMessage.messageAction = jsonObject;
            // console.log(jsonObject.params);
        }
        if (jsonObject.type === 'agentQuestion') {
            resultMessage.messageAction = jsonObject;
            const answerTemplate = jsonObject.params['answerTemplate']
            if (answerTemplate){ 
                setChatOpen(true);
                setChatCustomPromptVisible(false);
                setTemplatePromptVisible(true);
                setPromptTemplate(answerTemplate);
            } else {
                setChatOpen(true);
                setChatCustomPromptVisible(true);
                setTemplatePromptVisible(false);
            }
        }
    }

    const aiChatCall = async (messages: MessageEx[], onResult?: OnResultCallback, providerName?: string, modelName?: string) => {
        setCrossCheckResult(null);

        if (saasContext.userId) {
            if (saasContext.currentUsage.usedUSDBudget > saasContext.currentQuota.allowedUSDBudget) {
                toast.error('You have exceeded your monthly budget. Please contact us to upgrade your plan');
                return;
            }
        }

        if (isStreaming) {
            toast.error('Please wait until the previous request is finished');
            return;
        }
        

        setIsStreaming(true);
        const resultMessage:MessageEx = {
            id: nanoid(),
            content: '',
            createdAt: new Date(),
            role: 'assistant',
            visibility: MessageVisibility.Visible
        }
//        try {
            let messagesToSend = messages;
            if (messagesToSend.length > 0) {
                if (!messagesToSend[messagesToSend.length - 1].type)
                    messagesToSend[messagesToSend.length - 1].type = MessageType.Chat; 
                if (messagesToSend[messagesToSend.length - 1].displayMode === MessageDisplayMode.InternalJSONRequest) {
                    resultMessage.visibility = !resultMessage.finished ? MessageVisibility.ProgressWhileStreaming : MessageVisibility.Visible; // hide the response until the request is finished
                    if (agentContext) resultMessage.visibility = MessageVisibility.Hidden; // hide agent requests
                }

                if (messagesToSend[messagesToSend.length - 1].type == MessageType.Parse) {
                    messagesToSend = [messagesToSend[messagesToSend.length - 1]] // send only the parse message - context is not required - #111
                }
                if (process.env.NEXT_PUBLIC_CHAT_SAFE_MODE) {
                    console.log('Adding safe mode message');
                    if (messagesToSend[messagesToSend.length - 1].type === MessageType.Chat) {
                        messagesToSend = messagesToSend.filter(m => m.type !== MessageType.SafetyMessage);
                        const lastMsg = messagesToSend.splice(messagesToSend.length - 1, 1)[0];
                        messagesToSend = [...messagesToSend, {
                            content: prompts.safetyMessage({}),
                            role: 'user',
                            type: MessageType.SafetyMessage,
                            id: nanoid(),
                        }, lastMsg];

                    }
                 }
            }
            const result = await streamText({
                model: await aiProvider(providerName, modelName),
                messages: convertToCoreMessages(messagesToSend),
                temperature: process.env.NEXT_PUBLIC_CHAT_TEMPERATURE && modelName !== 'o1' ? parseFloat(process.env.NEXT_PUBLIC_CHAT_TEMPERATURE) : 1.0,
                //maxTokens: process.env.NEXT_PUBLIC_MAX_OUTPUT_TOKENS ? parseInt(process.env.NEXT_PUBLIC_MAX_OUTPUT_TOKENS) : 4096 * 2, - there's a config discrepancy with o3
                onFinish: async (e) =>  {
                    try {
                        await aggregateStats({
                            eventName: messagesToSend[messagesToSend.length - 1].type ?? MessageType.Chat,
                            completionTokens: e.usage.completionTokens,
                            promptTokens: e.usage.promptTokens,
                            createdAt: new Date().toISOString(),
                        });
                    } catch (e) {
                        toast.error(getErrorMessage(e));
                    }
                    if (e.text.indexOf('```json') > -1) {
                        resultMessage.displayMode = MessageDisplayMode.InternalJSONResponse 

                        const codeBlocks = findCodeBlocks(e.text);
                        if (codeBlocks.blocks.length > 0) {
                            for (const block of codeBlocks.blocks) {
                                if (block.syntax === 'json') {
                                    const jsonObject = JSON.parse(jsonrepair(block.code));
                                    if (jsonObject.displayMode) { // display mode
                                        resultMessage.displayMode = jsonObject.displayMode;
                                        processMessageAction(jsonObject, resultMessage);
                                    }
                                }
                            }
                        } else {
                            resultMessage.content = e.text;
                        }


                    }  else { 
                        resultMessage.displayMode = MessageDisplayMode.Text
                    }
                    resultMessage.finished = true;
                    if (onResult) onResult(resultMessage, e);
                }
            });
            
            if (agentContext) { resultMessage.displayMode = MessageDisplayMode.JSONAgentReponse; } // take it as default when agent
            for await (const delta of result.textStream) {
                resultMessage.content += delta;
                setMessages([...messagesToSend, resultMessage])
                setVisibleMessages(filterVisibleMessages([...messagesToSend, resultMessage]));
            }
            setIsStreaming(false);
            setMessages([...messagesToSend, resultMessage])
            setVisibleMessages(filterVisibleMessages([...messagesToSend, resultMessage]));
        // } catch (e) {
        //     const errMsg = 'Error while streaming AI response: ' + e;
        //     if (onResult) onResult(resultMessage, { finishReason: 'error', text: errMsg, usage: null });
        //     setIsStreaming(false);
        //     toast.error(errMsg);
        // }
    }

    const prepareMessage = (msg: CreateMessageEx | MessageEx, setMessages: React.Dispatch<React.SetStateAction<MessageEx[]>>, messages: MessageEx[], setLastMessage: React.Dispatch<React.SetStateAction<MessageEx | null>>) => {
        const newlyCreatedOne = { ...msg, id: nanoid(), visibility: msg.visibility ? msg.visibility : MessageVisibility.Visible } as MessageEx;
        if (newlyCreatedOne.content.indexOf('json') > -1) {
            newlyCreatedOne.displayMode = MessageDisplayMode.InternalJSONRequest;
        } else {
            newlyCreatedOne.displayMode = MessageDisplayMode.Text;
        }
        setMessages(prevMessages => [...prevMessages, newlyCreatedOne]);
        setVisibleMessages(prevMessages => filterVisibleMessages([...prevMessages, newlyCreatedOne]));
        setLastMessage(newlyCreatedOne);
        return newlyCreatedOne;
    }    
    const sendMessage = (envelope: CreateMessageEnvelope, includeExistingMessagesAsContext: boolean = true) => {
        const newlyCreatedOne = prepareMessage(envelope.message, setMessages, messages, setLastMessage);

        // removing attachments from previously sent messages
        // TODO: remove the workaround with "prev_sent_attachments" by extending the MessageEx type with our own to save space for it
        aiChatCall(includeExistingMessagesAsContext? [...messages.map(msg => {
            return Object.assign(msg, { experimental_attachments: null, prev_sent_attachments: msg.experimental_attachments })
        }), newlyCreatedOne] : [newlyCreatedOne], envelope.onResult, envelope.providerName, envelope.modelName);
    }

    const sendMessages = (envelope: CreateMessagesEnvelope, includeExistingMessagesAsContext: boolean = true) => {
        const newMessages = [];
        for (const msg of envelope.messages) {
            const newlyCreatedOne = prepareMessage(msg, setMessages, messages, setLastMessage);
            newMessages.push(newlyCreatedOne);
        }

        // TODO: Add multi LLM support - messages hould be sent to different LLMs based on the message llm model - so the messages should be grouped in threads

        // removing attachments from previously sent messages
        aiChatCall(includeExistingMessagesAsContext ? [...messages.map(msg => {
            return Object.assign(msg, { experimental_attachments: null, prev_sent_attachments: msg.experimental_attachments })
        }), ...newMessages] : [...newMessages], envelope.onResult, envelope.providerName, envelope.modelName);        
    }

    const aggregatedStats = async (): Promise<AggregatedStatsDTO> => {
        const apiClient = new StatApiClient('', dbContext, saasContext, { useEncryption: false });
        const aggregatedStats = await apiClient.aggregated() as AggregatedStatsResponse;
        if (aggregatedStats.status === 200) {
            console.log('Stats this and last month: ', aggregatedStats);
            return aggregatedStats.data;
        } else {
            throw new Error(aggregatedStats.message)
        }
    }

    const aggregateStats = async (newItem: StatDTO): Promise<StatDTO> => {
        const apiClient = new StatApiClient('', dbContext, saasContext, { useEncryption: false });
        const aggregatedStats = await apiClient.aggregate(newItem) as AggregateStatResponse;
        if (aggregatedStats.status === 200) {
            console.log('Stats aggregated', aggregatedStats);
            setLastRequestStat(aggregatedStats.data);
            if (saasContext.userId) await saasContext.loadSaaSContext(); // bc. this loads the current usage
            return aggregatedStats.data;
        } else {
            throw new Error(aggregatedStats.message)
        }
    }

    const value = { 
        messages,
        visibleMessages,
        lastMessage,
        providerName,
        sendMessage,
        sendMessages,
        chatOpen,
        setChatOpen,
        isStreaming,
        isCrossChecking,
        areRecordsLoaded,
        setRecordsLoaded,
        checkApiConfig,
        chatCustomPromptVisible,
        setChatCustomPromptVisible,
        chatTemplatePromptVisible,
        setTemplatePromptVisible,
        promptTemplate,
        setPromptTemplate,
        statsPopupOpen,
        setStatsPopupOpen,
        aggregateStats,
        lastRequestStat,
        aggregatedStats,
        crossCheckResult,
        autoCheck,
        aiDirectCall,
        aiDirectCallStream,
        setCrossCheckResult,
        agentContext,
        setAgentContext,
        startAgent,
        stopAgent,
        crosscheckAnswers,
        crosscheckModel,
        crosscheckProvider,
        setCrosscheckAnswers,
        setCrosscheckModel,
        setCrosscheckProvider,
        newChat,
        downloadMessage,
        agentFinishedDialogOpen,
        setAgentFinishedDialogOpen,
        agentFinishMessage
    }

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
};

