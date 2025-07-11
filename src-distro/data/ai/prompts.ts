import { ConfigContextType } from "@/contexts/config-context";
import { Record, recordItemSchema } from "@/data/client/models";
import { zodToJsonSchema } from "zod-to-json-schema";

type PromptContext = {
    record?: Record;
    config?: ConfigContextType | null;
}
const itemSchema = zodToJsonSchema(recordItemSchema);


export type TranslationBenchmarkContext = {
    originalRecord: Record;
    humanTranslationRecord: Record;
    aiTranslationRecord: Record;
}

export type ParseSinglePagePromptContext = {
    record?: Record;
    config?: ConfigContextType | null;
    page?: number;
}

function recordDescriptionPrompt(context: PromptContext) {
    return `<summary-field>Please fill the "summary" field of the record based on these rules:
        0. Summary should be ALLWAYS IN ENGLISH.
        1. Create a table with the following columns titles: Page, Summary, Types of data, Importance
        2. From the record text put into table columns actual: page numbers, one sentece summary of the page content, full english nice names of the types of medical record included on this page, overal importance (1-10 (higher is more important)) for the medical case descibed in the document
        3. Put the page numbers in table in this format: Page X
    </summary-field>`;
}

export const prompts = {
    
    translationBenchmark: ({ originalRecord, humanTranslationRecord, aiTranslationRecord }: TranslationBenchmarkContext) => {
        return `Please create a translation comparison report. 
                This is the original record: ${originalRecord.text}
                
                This is the human translation: ${humanTranslationRecord.text}
                
                This is the AI translation: ${aiTranslationRecord.text}
                
                Please analyze and provide:
                1. A table comparing key differences between translations
                2. Calculate overall % fit of human and AI translations vs original
                3. Highlight any significant meaning changes or errors
                4. Provide recommendations for improving both translations
                
                Please format the response in markdown.`;
    },

    recordParseSinglePage: (context: ParseSinglePagePromptContext) => {
        return 'This is the page number: ' + context.page + '. Include the page number as a first line of the text: Page ' + context.page + ' \
                If valid health data, please convert it to the markdown text exactly as it is in the original document. \
                If the document is handwritten then dates are also handwritten most of the times, do not guess the dates from what is for example a footnotes/template notes. Try to not make any assumptions/interpretations over what is literally in the text. \
                Use markdown to make a nice format of the document - as close as possible to the original document. \
                Return only markdown text of this document with no additions, comments, no intros no other answers. Just exact text. \
                Resulting document should be in the same language as the original document. \
                Do not add any terms or words that are not in the text. \
                attachments to text. One attachment is a one page of the record. Include page numbers in markdown.  Please use markdown to format it nicely and return after JSON object.'
    }, 
    recordParseMetadata: (context: ParseSinglePagePromptContext & { recordContent?: string }) => {
        return 'Parse this medical record data text to JSON array of records including all findings, records, details, tests results, medications, diagnosis and others with the schema defined below. \
        If this page DOES NOT CONTAIN ANY HEALTH DATA, return ```json { error: "No health data found" }```. \
        First: JSON should be all in original language. \
        Each medical record should be a row of returned JSON array of objects in format given below. \
        First element of an array should be for metadata of all pages processed - and an overall summary of all items. \
        <first_item> \
        For this first summary item: \
        - Summary the overal record - all the items - with a nice sentence and put it under "title". Extract keywords which are the medical examination results included in the record and put it in "tags" key including one tag equal to year of this record tags can not be personal data. \
        ' + recordDescriptionPrompt(context) + '\
        - Do not put into summary and title any terms or words that are not in the text. Add page number of the terms occurences to the terms used in the title and summary in () brackets. \
        - Set the "type" to "metadata" and "subtype" to "summary". \
        - Set the the other fields accordingly to the other items. \
        </first_item> \
        <next_items> \
        For next items: \
        If value contains multiple data (eg. numbers) store it as separate items. Freely extend it when needed to not miss any data! \
        Include the type of this results in english (eg. "blood_results", "rmi") in "type" key of JSON and then more detailed type in "subtype" key.  \
        Include the language of the document inside "language" key.  If the result is single block of text please try additionaly to saving text result  \
        extract very detailed and all features from it and put it as an array under "findings" key. \
        </next_items> \
        If the document is handwritten then dates are also handwritten most of the times, do not guess the dates from what is for example a footnotes/template notes. Try to not make any assumptions/interpretations over what is literally in the text.\
       Do not add to the text anything not explicitly existing in the source documents. \r\n\r\n <item_schema>\r\n\r\n```json\r\n \
        ' + JSON.stringify(itemSchema) + '```\r\n\r\n</item_schema>\r\n\r\n <record_text>Record text: ' + (context.recordContent ? context.recordContent : context.record?.text) + '</record_text>'
    },
    
    recordParseMultimodal: (context: PromptContext) => {
        return 'Check if this data contains health results or info. If not return Error message + JSON: { error: ""}. If valid health data, please parse it to JSON array of records including all findings, records, details, tests results, medications, diagnosis and others with the schema defined below. \
                First: JSON should be all in original language. \
                Each medical record should be a row of returned JSON array of objects in format given below. \
                First element of an array should be for metadata of all pages processed - and an overall summary of all items. \
                <first_item> \
                For this first summary item: \
                - Summary the overal record - all the items - with a nice sentence and put it under "title". Extract keywords which are the medical examination results included in the record and put it in "tags" key including one tag equal to year of this record tags can not be personal data. \
                ' + recordDescriptionPrompt(context) + '\
                - Do not put into summary and title any terms or words that are not in the text. Add page number of the terms occurences to the terms used in the title and summary in () brackets. \
                - Set the "type" to "metadata" and "subtype" to "summary". \
                - Set the the other fields accordingly to the other items. \
                </first_item> \
                <next_items> \
                For next items: \
                If value contains multiple data (eg. numbers) store it as separate items. Freely extend it when needed to not miss any data! \
                Include the type of this results in english (eg. "blood_results", "rmi") in "type" key of JSON and then more detailed type in "subtype" key.  \
                Include the language of the document inside "language" key.  If the result is single block of text please try additionaly to saving text result  \
                extract very detailed and all features from it and put it as an array under "findings" key. \
                </next_items> \
                Second: Markdown text - please do kind of OCR - so convert all the \
                attachments to text. One attachment is a one page of the record. Include page numbers in markdown. If the document is handwritten then dates are also handwritten most of the times, do not guess the dates from what is for example a footnotes/template notes. Try to not make any assumptions/interpretations over what is literally in the text. Please use markdown to format it nicely and return after JSON object, \
                wrap it with  ```markdown on start and  ``` on end of the text. Do not add to the text anything not explicitly existing in the source documents. \r\n\r\n <item_schema>\r\n\r\n```json\r\n \
                ' + JSON.stringify(itemSchema) + '```\r\n\r\n</item_schema>\r\n\r\n' 
    }, // [ { type: "blood_results", subtype: "morphology", findings: [], ... }, {type: "mri", subtype: "head mri", ...}]
    recordParseOCR: (context: PromptContext, ocrText: string) => {
        return 'Below is my health result data in plain text. Check if this data contains health results or info. If not return Error message + JSON: { error: ""}. If valid health data, parse it to JSON array of records including all findings, records, details, tests results, medications, diagnosis and others with the schema defined below. \
                First: JSON should be all in original language. \
                First element of an array should be for metadata of all pages processed - and an overall summary of all items. \
                <first_item> \
                For this first summary item: \
                - Summary the overal record - all the items - with a nice sentence and put it under "title". Extract keywords which are the medical examination results included in the record and put it in "tags" key including one tag equal to year of this record tags can not be personal data. \
                ' + recordDescriptionPrompt(context) + '\
                - Do not put into summary and title any terms or words that are not in the text. Add page number of the terms occurences to the terms used in the title and summary in () brackets. \
                - Set the "type" to "metadata" and "subtype" to "summary". \
                - Set the the other fields accordingly to the other items. \
                </first_item> \
                <next_items> \
                For next items: \
                Each medical record should be a row of returned JSON array of objects in format given below. If value contains multiple data (eg. numbers) store it as separate items. Freely extend it when needed to not miss any data!\
                Include the type of this results in english (eg. "blood_results", "rmi") in "type" key of JSON and then more detailed type in "subtype" key.  \
                Do not put into summary and title any terms or words that are not in the text.  Add page number of the terms occurences to the terms used in the title and summary in () brackets.  \
                Summary the record to one nice sentence and put it under "title". Extract keywords which are the medical examination results included in the record and put it in "tags" key including one tag equal to year of this record tags can not be personal data. \
                Include the language of the document inside "language" key.  If the result is single block of text please try additionaly to saving text result  \
                extract very detailed and all features from it and put it as an array under "findings" key. \
                </next_items> \
                \n\r\n\rSecond: Fix all the original text issues and glitches. Please use markdown to format the nicely and return after JSON object, \
                wrap it with  ```markdown on start and  ``` on end of the text. Do not add to the text anything not explicitly existing in the source documents. \r\n\r\n <item_schema>\r\n\r\n```json\r\n' +
                JSON.stringify(itemSchema) + '```\r\n\r\n</item_schema>\r\n\r\n Original text: ' + ocrText;
    }, // [ { type: "blood_results", subtype: "morphology", findings: [], ... }, {type: "mri", subtype: "head mri", ...}]

    recordParseMultimodalTranscription: (context: PromptContext) => {
        return 'This is my health result data AND audio transcription. Check if this data contains health results or info. If not return Error message + JSON: { error: ""}. If valid health data, fix errors in transcription. Please parse it to JSON array of records including all findings, records, details, tests results, medications, diagnosis and others with the schema defined below. \
                Audio transcription: ' + context.record?.transcription + '\r\n\
                First: JSON should be all in original language. \
                First element of an array should be for metadata of all pages processed - and an overall summary of all items. \
                <first_item> \
                For this first summary item: \
                - Summary the overal record - all the items - with a nice sentence and put it under "title". Extract keywords which are the medical examination results included in the record and put it in "tags" key including one tag equal to year of this record tags can not be personal data. \
                ' + recordDescriptionPrompt(context) + '\
                - Do not put into summary and title any terms or words that are not in the text. Add page number of the terms occurences to the terms used in the title and summary in () brackets. \
                - Set the "type" to "metadata" and "subtype" to "summary". \
                - Set the the other fields accordingly to the other items. \
                </first_item> \
                <next_items> \
                For next items: \
                Each medical record should be a row of returned JSON array of objects in format given below. If value contains multiple data (eg. numbers) store it as separate items. Freely extend it when needed to not miss any data!\
                Include the type of this results in english (eg. "blood_results", "rmi") in "type" key of JSON and then more detailed type in "subtype" key.  \
                Do not put into summary and title any terms or words that are not in the text.  Add page number of the terms occurences to the terms used in the title and summary in () brackets.  \
                Summary the record to one nice sentence and put it under "title". Extract keywords which are the medical examination results included in the record and put it in "tags" key including one tag equal to year of this record tags can not be personal data. \
                Include the language of the document inside "language" key.  If the result is single block of text please try additionaly to saving text result  \
                extract very detailed and all features from it and put it as an array under "findings" key. \
                </next_items> \
                Second: Markdown text - please do kind of OCR - so convert all the \
                attachments to text. One attachment is a one page of the record. Include page numbers in markdown. If the document is handwritten then dates are also handwritten most of the times, do not guess the dates from what is for example a footnotes/template notes. Try to not make any assumptions/interpretations over what is literally in the text. Please use markdown to format it nicely and return after JSON object, \
                wrap it with  ```markdown on start and  ``` on end of the text. Do not add to the text anything not explicitly existing in the source documents. \r\n\r\n <item_schema>\r\n\r\n```json\r\n \
                ' + JSON.stringify(itemSchema) + '```\r\n\r\n</item_schema>\r\n\r\n'
    }, // [ { type: "blood_results", subtype: "morphology", findings: [], ... }, {type: "mri", subtype: "head mri", ...}]
    recordParseOCRTranscription: (context: PromptContext, ocrText: string) => {
        return 'Below is my health result data in plain text AND audio transcription. Check if this data contains health results or info. If not return Error message + JSON: { error: ""}. If valid health data, fix errors in transcription. Parse it to JSON array of records including all findings, records, details, tests results, medications, diagnosis and others with the schema defined below. \
                Audio transcription: ' + context.record?.transcription + '\r\n\
                First: JSON should be all in original language. \
                First element of an array should be for metadata of all pages processed - and an overall summary of all items. \
                <first_item> \
                For this first summary item: \
                - Summary the overal record - all the items - with a nice sentence and put it under "title". Extract keywords which are the medical examination results included in the record and put it in "tags" key including one tag equal to year of this record tags can not be personal data. \
                ' + recordDescriptionPrompt(context) + '\
                - Do not put into summary and title any terms or words that are not in the text. Add page number of the terms occurences to the terms used in the title and summary in () brackets. \
                - Set the "type" to "metadata" and "subtype" to "summary". \
                - Set the the other fields accordingly to the other items. \
                </first_item> \
                <next_items> \
                For next items: \
                Each medical record should be a row of returned JSON array of objects in format given below. If value contains multiple data (eg. numbers) store it as separate items. Freely extend it when needed to not miss any data!\
                Include the type of this results in english (eg. "blood_results", "rmi") in "type" key of JSON and then more detailed type in "subtype" key.  \
                One attachment is a one page of the record. Include page numbers in markdown. \
                If the document is handwritten then dates are also handwritten most of the times, do not guess the dates from what is for example a footnotes/template notes. Try to not make any assumptions/interpretations over what is literally in the text. \
                Do not put into summary and title any terms or words that are not in the text.  Add page number of the terms occurences to the terms used in the title and summary in () brackets.  \
                Summary the record to one nice sentence and put it under "title". Extract keywords which are the medical examination results included in the record and put it in "tags" key including one tag equal to year of this record tags can not be personal data. \
                Include the language of the document inside "language" key.  If the result is single block of text please try additionaly to saving text result  \
                extract very detailed and all features from it and put it as an array under "findings" key. \
                </next_items> \
                \n\r\n\rSecond: Fix all the original text issues and glitches. Please use markdown to format the nicely and return after JSON object, \
                wrap it with  ```markdown on start and  ``` on end of the text. Do not add to the text anything not explicitly existing in the source documents. \r\n\r\n <item_schema>\r\n\r\n```json\r\n' +
                JSON.stringify(itemSchema) + '```\r\n\r\n</item_schema>\r\n\r\n Original text: ' + ocrText;
    }, // [ { type: "blood_results", subtype: "morphology", findings: [], ... }, {type: "mri", subtype: "head mri", ...}]


    generateRecordMetaData: (context: PromptContext, text: string) => {
        return 'Generate meta data for the record: ' + text + '. Do not use the domain specific terms and words that are not in the text in the summary - do not add your custom interpretations over medical terms. Return JSON with written in original language in the following schema: \
                ' + JSON.stringify(itemSchema) + '```\r\n\r\n' + recordDescriptionPrompt(context)
    },

    recordRemovePII: (context: PromptContext, ocrText: string) => {
        return 'Please remove Personal Data (names, first names, last names, company names, emails, id numbers, phone numbers, addresses), fix language errors and format markdown from the text ' + ocrText
    },
    recordIntoChat: (context: PromptContext) => {
        return 'Below is my health result data in JSON format. Please describe the results in plain language. Note all exceptions from the norm and tell me what it could mean? Answer in the language of original document. Return text, no code. \r\n\r\n```json\
        \r\n' + JSON.stringify(context.record?.json) + '```'
    },
    recordIntoChatSimplified: (context: PromptContext) => {
        return 'Structured health record (Record Id: ' + context.record?.id + ', date: ' + context.record?.eventDate + ') in JSON:  \r\n\r\n```json\
        \r\n' + JSON.stringify(context.record?.json) + '```'
    },
    translateRecord: (context: PromptContext & { language: string}) => {
        return 'Translate this health record to ' + context.language + ' language. Be as exact as possible. Do not add any custom interpretations over medical terms. Return full markdown text and full json text in single message, do not shorten anytrhing. Return translated JSON plus translated markdown: \r\n\r\n```json\
        '+ JSON.stringify(context.record?.json) + "```\r\n\r\n```markdown\r\n" + context.record?.text + '```';
    },
    translateRecordText: (context: PromptContext & { language: string}) => {
        return 'Translate this health record to ' + context.language + ' language, Be as exact as possible. Do not add any custom interpretations over medical terms.  Return full text, do not shorten anytrhing. Return full translated markdown and JSON ' + context.record?.description + ' ' + context.record?.text;
    },
    translateRecordTextByPage: (context: PromptContext & { language: string, page: number, pageContent: string}) => {
        return 'Translate this page, no: ' + context.page + ', of health record to ' + context.language + ' language, Be as exact as possible. Keep markdown formatting as close to original as possible. Do not add any custom interpretations over medical terms.  Return full text, do not shorten anytrhing. Return full translated markdown and nothing else' + context.pageContent;
    },
    recordSummary: (context: PromptContext) => {
        return 'Summarize the health result data below in one sentence: ' + context.record?.text
    },
    recordsToChat: (context: PromptContext) => {
        return 'OK. Now I will send you all my health records. Answer for now just with the number of records you received. Then I will ask more questions. ALWAYS add (Record Id: number) to the answer based on this record.'
    },
    recordsToChatDone: (context: PromptContext & { records: Record[] }) => {
        return 'Health record context (' + context.records.length + ' records) sent.';
    },
    bestNextSteps: (context: PromptContext) => {
        return 'Based on the health result data below, what are the best next steps? What are the most important recommendations? '+ context.record?.text
    },
    recordInterpretation: (context: PromptContext) => {
        return 'Interpret the health result data below. What are the most important findings? What are the most important exceptions from the norm? What could they mean? What are the most important recommendations? Answer in the language of original document. Return text, no code. \r\n\r\n```json\
        \r\n' + JSON.stringify(context.record?.json) + '```'
    },
    safetyMessage: (context: PromptContext) => {
        return 'Add information sources and links. Avoid diagnosis and any potentially dangerous recommendations. Do not add any custom interpretations over medical terms. Try to base on exact medical terms used in the medical records and always base on factual data from the context. Providing any facts from the records history always ADD REFERENCE IN BRACKETS to the medical records from the context (for example Record Id: 7, referencing this record)'
    },
    autoCheck: (context: PromptContext) => {
        return 'Check the if last message is correct and valid regarding the medical knowledge and the context included within the conversaion. Score: Green, Yellow or Red the message risk and validity. If needed return the next question I should ask to fix the answer or get deeper. Add the explanation including your own answer and safe recommendations (include sources). Return ONLY JSON for example: { "risk": "green", "validity": "green", "answer": "For Asthma you should contact your physician. Ibuprofen is not the right answer", "explanation": "Ibuprofen is not valid for treating asthma", nextQuestion: "What is the recommended treatment for asthma?" }'
    },
    preVisitQuery: (context: PromptContext) => {
        return 'You are medical doctor assistant and you are about to make a pre-visit screen. First introduce yourself like: "Hello there! I\'m a pre-visit assistant ready to ask you some important questions to prepare your physician for making your visit most effective". Ask me questions. \n\r \
        Always include the reason and the source - why you are asking the question in the JSON format - example: \
        <example>```json {displayMode: "jsonAgentResponse", type="meta", params: {reason: "I am asking this question because your age can be related to symptoms provided. Source: National Instituteof health, migraine treatment"} }```</example> \
        You could send me an answer template if there is something to select - if so it should be a json: \r\n \
        <example>```json {displayMode: "jsonAgentResponse", type: "agentQuestion", params: {question: "What was your body temperature?",answerTemplate: "My body temperature was higher than > 37 deg. celsius: {select:yes|no}}}" }```</example>\r\n Only {select:} is supported in the templates.\
         This is an option. plain text answers are  fine for most of the questions too. You should ask me about my specific problem and also about my age, drugs i am taking, chronic diseases etc. Ask me no more than 10 questions - trying to get all the details why I\'m contacting the doctor, symptoms. You may ask few things inone question as in example above. Dig deeper based on the previous answers. \
         Then sumarrize the interview with a single text (markdown) answer as a preparation for the doctor. \
         In the last message with summary include the following json: ```json  {displayMode: "jsonAgentResponse", type: "agentExit", params: { summary: "Here goes the summary .... "} }``` \
         Only ask questions. If users ask you about anuything be kind but do not answer but say he or she should ask physician in thiscase. \
         Ask one question, wait for answer and only then ask another question.'
    }
};