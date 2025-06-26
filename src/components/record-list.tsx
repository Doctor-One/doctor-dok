import { useContext, useEffect, useState } from "react";
import RecordItem from "./record-item";
import { NoRecordsAlert } from "./shared/no-records-alert";
import { RecordContext } from "@/contexts/record-context";
import { FolderContext } from "@/contexts/folder-context";
import DataLoader from "./data-loader";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { sort } from "fast-sort";
import { useEffectOnce } from "react-use";
import { ConfigContext } from "@/contexts/config-context";
import { CalendarIcon, PlusIcon, TagIcon, XCircleIcon } from "lucide-react";
import { Button } from "./ui/button";
import { record } from "zod";
import { DataLoadingStatus, Folder } from "@/data/client/models";
import RecordsFilter from "./records-filter";
import { OnboardingHealthActions } from "@/components/onboarding-health-actions";

export default function RecordList({ folder }: {folder: Folder}) {
  const recordContext = useContext(RecordContext);
  const folderContext = useContext(FolderContext);
  const [tagsTimeline, setTagsTimeline] = useState<{year: string, freq: number }[]>([]);
  const [displayAttachmentPreviews, setDisplayAttachmentPreviews] = useState(false);
  const config = useContext(ConfigContext);

  const getSortBy = (sortBy: string) => {
    // Split the string into field and direction
    const [field, direction] = sortBy.split(' ');

    // Determine if it's ascending or descending
    const isDesc = direction.toLowerCase() === 'desc';

    // Return the corresponding object
    if (isDesc) {
        return [{ desc: (a: any) => a[field] }];
    } else {
        return [{ asc: (a: any) => a[field] }];
    }
  }

  useEffect(() => {
    if (recordContext) setTagsTimeline(recordContext?.getTagsTimeline());
  }, [recordContext?.records]);

  useEffectOnce(() => {
    config?.getServerConfig('displayAttachmentPreviews').then((value) => {
      if (typeof value === "boolean") {
        setDisplayAttachmentPreviews(value as boolean);
      } else {
        setDisplayAttachmentPreviews(true); // default value
      }
    });
  });


  useEffect(() => {
    if (folderContext?.currentFolder) {
      recordContext?.startAutoRefresh(folderContext.currentFolder);
    }
  }, [folderContext?.currentFolder]);

  return (
    <div className="bg-white dark:bg-zinc-900 md:p-4 md:rounded-lg shadow-sm">
      <div>
            <div className={(recordContext?.records && recordContext?.records.length > 0 && (recordContext.filterAvailableTags && recordContext.filterAvailableTags.length > 0)) || recordContext?.loaderStatus === DataLoadingStatus.Loading ? `flex xs:p-2 md:pl-0` : `hidden` }>
               <div className="flex flex-wrap items-center gap-1 w-full ">
                { recordContext?.filterAvailableTags && recordContext?.filterAvailableTags.length > 0 ? (
                  <RecordsFilter />
                ) : (recordContext?.loaderStatus === DataLoadingStatus.Loading ? (<div className="text-sm">Loading records...</div>) : null) }

                  {recordContext?.filterAvailableTags && recordContext?.filterAvailableTags.length > 0 ? (
                    tagsTimeline.map((tag, index) => (
                      <div key={index} className="text-sm inline-flex w-auto"><Button className="h-10" variant={recordContext.filterSelectedTags.includes(tag.year) ? 'default' : 'secondary' } onClick={() => { 
                        if (folderContext?.currentFolder) {
                            recordContext?.setFilterSelectedTags(recordContext.filterSelectedTags.filter(t => !tagsTimeline.map(t => t.year).includes(t)));
                            recordContext?.filterToggleTag(tag.year);
                        }
                      }
                      }><CalendarIcon className="w-4 h-4 mr-2" /> {tag.year} ({tag.freq}) {recordContext.filterSelectedTags.includes(tag.year) ? (<XCircleIcon className="w-4 h-4 ml-2" />) : null }</Button></div>
                    ))
                  ) : ''}

                  {recordContext?.filterSelectedTags.filter(tg => !tagsTimeline.find(t => parseInt(t.year) === parseInt(tg))).map((tag, index) => (
                    <div key={index} className="text-sm inline-flex w-auto"><Button className="h-10" variant={recordContext.filterSelectedTags.includes(tag) ? 'default' : 'secondary' } onClick={() => { 
                      if (folderContext?.currentFolder) {
                        recordContext?.filterToggleTag(tag);
                      }
                    }
                    }><TagIcon className="w-4 h-4 mr-2" /> {tag} <XCircleIcon className="w-4 h-4 ml-2" /></Button></div>
                  ))}
                </div>      

                <div className="justify-center w-8 h-8 items-center ml-5">
                { (recordContext?.loaderStatus === "loading") ? (
                  <DataLoader />
                ) : (null) }              
                </div>

            </div>

            { (recordContext?.loaderStatus === "error") ? (
              <Alert>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Error while loading folder records. Please try again later.
                </AlertDescription>
              </Alert>
            ) : (null) }
            { (recordContext?.loaderStatus === "success" && recordContext?.records.length > 0 && recordContext?.filteredRecords.length === 0) ? ( // no filtered records in the database
              <NoRecordsAlert title="No records found">
                No records found in the database. Please add a new record using <strong>+</strong> icon above.
              </NoRecordsAlert>
            ) : (null) }
            { (recordContext?.loaderStatus === "success" && recordContext?.records.length === 0) ? ( // no records at all in the database
              <OnboardingHealthActions />          
            ) : (null) }            

            {sort(recordContext?.filteredRecords ?? []).by(getSortBy(recordContext?.sortBy ?? 'eventDate desc')).map((record, index) => (
              <RecordItem key={index} record={record} displayAttachmentPreviews={displayAttachmentPreviews} isFirstRecord={index === 0} />
            ))}
          </div>

    </div>
  );
}