import React, { useContext } from 'react';
import ZoomableImage from './zoomable-image';
import { ChatContext, MessageEx, MessageVisibility } from '@/contexts/chat-context';
import remarkGfm from 'remark-gfm';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import Markdown from 'react-markdown'
import styles from './chat-message.module.css';
import { useTheme } from 'next-themes';
import showdown from 'showdown'
import { Components } from 'react-markdown';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Button } from '@/components/ui/button';
import { DownloadIcon, SaveIcon, Loader2 } from 'lucide-react';
import { RecordContext } from '@/contexts/record-context';
import { DataLoadingStatus } from '@/data/client/models';
import { removeCodeBlocks, convertRecordIdsToLinks } from '@/lib/utils';
import DataLoader from './data-loader';
import { QuestionMarkCircledIcon, QuestionMarkIcon } from '@radix-ui/react-icons';
import { toast } from 'sonner';

interface ChatMessageProps {
    message: MessageEx;
    ref?: React.Ref<HTMLDivElement>;
}

const CodeBlock: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
    const { theme, systemTheme } = useTheme();
    const shTheme = (theme === 'system' ? systemTheme : theme) === 'dark' ? 'material-dark' : 'material-light';
    const match = /language-(\w+)/.exec(className || '');
    
    return match ? (
        <SyntaxHighlighter
            PreTag="div"
            wrapLines={true}
            wrapLongLines={true}
            language={match[1]}
            theme={shTheme}
        >{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
    ) : (
        <code className={className}>
            {children}
        </code>
    );
};

const ChatMessage: React.FC<ChatMessageProps> = ({ message, ref }) => {
    const { theme, systemTheme } = useTheme();
    const chatContext = useContext(ChatContext);
    const recordContext = useContext(RecordContext);
    const shTheme = (theme === 'system' ? systemTheme : theme) === 'dark' ? 'material-dark' : 'material-light';
    
    return (
        <div id={'msg-' + message.id} ref={ref} className={message.role === 'user' ?  "flex items-start gap-4 justify-end" :  "flex items-start gap-4"}>
            <div className={message.role === 'user' ?  "p-4 gap-4 text-right rounded-lg max-w-[90%] bg-gray dark:bg-zinc-500" :  "p-4 gap-1 rounded-lg max-w-[90%] bg-white dark:bg-zinc-950"}>
                <div className="font-bold">{message.name}</div>
                <div className="prose text-sm text-muted-foreground">
                    {(message.visibility === MessageVisibility.ProgressWhileStreaming  && !message.finished) ? (
                        <div className="flex"><span className="text-xs">Parsing data in progress ({message.recordRef ? 'rec: ' + message.recordRef.id + ', ' : ''}queue length: {recordContext?.parseQueueLength ? recordContext?.parseQueueLength : 1})... <Button className="h-6" onClick={(e) => message.visibility = MessageVisibility.Visible }>Show progress</Button></span></div>
                    ) : (
                        (message.displayMode === 'internalJSONRequest') ? (
                            <div>
                                <Accordion type="single" collapsible className="w-full">
                                    <AccordionItem value="item-1">
                                        <AccordionTrigger>Data object request</AccordionTrigger>
                                        <AccordionContent>
                                            <Markdown className={styles.markdown} remarkPlugins={[remarkGfm]} components={{
                                                code(props) {
                                                    const {children, className, node, ...rest} = props
                                                    const match = /language-(\w+)/.exec(className || '')
                                                    return match ? (
                                                        <SyntaxHighlighter
                                                            PreTag="div"
                                                            wrapLines={true}
                                                            wrapLongLines={true}
                                                            language={match[1]}
                                                            theme={shTheme}
                                                        >{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                                                    ) : (
                                                        <code className={className}>
                                                            {children}
                                                        </code>
                                                    )
                                                }
                                            }}>{convertRecordIdsToLinks(message.content)}</Markdown>
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            </div>
                        ) : ((message.displayMode === 'internalJSONResponse' ? (
                            <div className="w-full">
                                <Accordion type="single" collapsible className="w-full">
                                    <AccordionItem value="item-1">
                                        <AccordionTrigger>Data object response</AccordionTrigger>
                                        <AccordionContent>
                                            <Markdown className={styles.markdown} remarkPlugins={[remarkGfm]} components={{
                                                code(props) {
                                                    const {children, className, node, ...rest} = props
                                                    const match = /language-(\w+)/.exec(className || '')
                                                    return match ? (
                                                        <SyntaxHighlighter
                                                            PreTag="div"
                                                            wrapLines={true}
                                                            wrapLongLines={true}
                                                            language={match[1]}
                                                            theme={shTheme}
                                                        >{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                                                    ) : (
                                                        <code className={className}>
                                                            {children}
                                                        </code>
                                                    )
                                                }
                                            }}>{convertRecordIdsToLinks(message.content)}</Markdown>
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            </div>
                        ) : ((message.displayMode === 'jsonAgentResponse' ? (
                            (!message.finished ? <>Thinking ...</> : (
                                <><Markdown className={styles.markdown} remarkPlugins={[remarkGfm]} components={{
                                    code(props) {
                                        const {children, className, node, ...rest} = props
                                        const match = /language-(\w+)/.exec(className || '')
                                        return match ? (
                                            <SyntaxHighlighter
                                                PreTag="div"
                                                wrapLines={true}
                                                wrapLongLines={true}
                                                language={match[1]}
                                                theme={shTheme}
                                            >{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                                        ) : (
                                            <code className={className}>
                                                {children}
                                            </code>
                                        )
                                    }
                                }}>
                                    {((message.messageAction && message.messageAction.type === 'agentQuestion') ? (
                                        convertRecordIdsToLinks(removeCodeBlocks(message.content)) + message.messageAction?.params.question
                                    ) : (convertRecordIdsToLinks(removeCodeBlocks(message.content))))}
                                </Markdown>{(message.messageAction?.params.reason ? (<QuestionMarkCircledIcon className='m-2 w-4 h-4 cursor-pointer' onClick={(e) => toast(message.messageAction?.params.reason)} />) : (null))}</>))) : (
                            <Markdown className={styles.markdown} remarkPlugins={[remarkGfm]} components={{
                                code(props) {
                                    const {children, className, node, ...rest} = props
                                    const match = /language-(\w+)/.exec(className || '')
                                    return match ? (
                                        <SyntaxHighlighter
                                            PreTag="div"
                                            wrapLines={true}
                                            wrapLongLines={true}
                                            language={match[1]}
                                            theme={shTheme}
                                        >{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                                    ) : (
                                        <code className={className}>
                                            {children}
                                        </code>
                                    )
                                }
                            }}>
                                {convertRecordIdsToLinks(message.content)}
                            </Markdown>
                        ))))))}
                    {message.role !== 'user' && message.finished && !message.recordSaved ? (
                        <div className="flex-wrap flex items-center justify-left">
                            <Button title="Save message as new record" variant="ghost" size="icon" onClick={async () => {
                                try {
                                    recordContext?.setOperationStatus(DataLoadingStatus.Loading);
                                    await recordContext?.updateRecordFromText(message.content, message.recordRef ?? null, true);
                                } finally {
                                    recordContext?.setOperationStatus(DataLoadingStatus.Success);
                                }
                            }} disabled={recordContext?.operationStatus === DataLoadingStatus.Loading}>
                                {recordContext?.operationStatus === DataLoadingStatus.Loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <SaveIcon />
                                )}
                            </Button>
                            <Button title="Download message as HTML report" variant="ghost" size="icon" onClick={() => {
                                chatContext.downloadMessage(message, `report-${message.id}`, 'html');
                            }}><DownloadIcon /></Button>
                        </div>
                    ) : null}
                    <div className="flex-wrap flex items-center justify-left min-h-100">
                        {message.experimental_attachments
                            ?.filter(attachment =>
                                attachment.contentType?.startsWith('image/'),
                            )
                            .map((attachment, index) => (
                                <ZoomableImage
                                    className='w-100 p-2'
                                    width={100}
                                    height={100}
                                    key={`${message.id}-${index}`}
                                    src={attachment.url}
                                    alt={attachment.name}
                                />
                            ))}
                        {message.prev_sent_attachments
                            ?.filter(attachment =>
                                attachment.contentType.startsWith('image/'),
                            )
                            .map((attachment, index) => (
                                <ZoomableImage
                                    className='w-100 p-2'
                                    width={100}
                                    height={100}
                                    key={`${message.id}-${index}`}
                                    src={attachment.url}
                                    alt={attachment.name}
                                />
                            ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatMessage;