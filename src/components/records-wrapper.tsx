import { useContext, useEffect } from "react";
import RecordForm from "./record-form";
import RecordList from "./record-list";
import { FolderContext } from "@/contexts/folder-context";
import DatabaseLinkAlert from "./shared/database-link-alert";
import { ConfigContext } from "@/contexts/config-context";
import { NoRecordsAlert } from "./shared/no-records-alert";
import { FoldersIcon, ListIcon, TagIcon, UsersIcon } from "lucide-react";
import { useEffectOnce } from "react-use";
import { RecordContext } from "@/contexts/record-context";
import { DatabaseContext } from "@/contexts/db-context";
import { DatabaseAuthStatus } from "@/data/client/models";
import { Button } from "./ui/button";
import { useDocumentVisibility } from "@/hooks/use-document-visibility";
import Link from 'next/link'; // Add this import
import { AuditContext } from "@/contexts/audit-context";
const termsUrl = process.env.NEXT_PUBLIC_TERMS_URL ?? '/content/terms';
const privacyUrl = process.env.NEXT_PUBLIC_TERMS_URL ?? '/content/privacy';

export default function RecordsWrapper({}) {
  const folderContext = useContext(FolderContext);
  const configContext = useContext(ConfigContext);
  const dbContext = useContext(DatabaseContext)
  const recordContext = useContext(RecordContext);
  const documentVisible = useDocumentVisibility();
  const auditContext = useContext(AuditContext)

  useEffect(() => {
    if(recordContext && folderContext && folderContext.currentFolder) {
      //if (documentVisible) {
        recordContext?.listRecords(folderContext?.currentFolder).then(fetchedRecords => {
          if (dbContext && folderContext?.currentFolder) auditContext?.record({ eventName: 'listRecords', recordLocator: JSON.stringify([{ folderId: folderContext?.currentFolder.id, recordIds: [fetchedRecords.map(r => r.id)] }]) });          
        });

      //}
    }; // eslint-disable-next-line    
  }, [folderContext?.currentFolder/*, documentVisible*/]);

    
  return (
    <div className="grid grow w-full bg-zinc-100 dark:bg-zinc-950">
      <div className="md:p-4 xs:p-0">
        { (folderContext?.currentFolder !== null) ? (
          <div>
            <div className="flex-1 overflow-auto">
              <div className="grid gap-4">
                { (dbContext?.authStatus === DatabaseAuthStatus.Authorized && folderContext?.currentFolder) ? (
                  <RecordList key={0} folder={folderContext?.currentFolder} />
                ) : (
                  <DatabaseLinkAlert />
                ) }
              </div>
            </div>
          </div>
        ) : (
        <NoRecordsAlert title="No folder selected">
          <div className="flex items-center">Please do select current folder using the <FoldersIcon className="flex ml-4 mr-4" /> icon above.</div>
        </NoRecordsAlert>          
        ) }
      </div>
      <div className="items-center justify-between gap-4 mt-4 text-sm text-center p-6">
        By using the application You accept Doctor Dok <Link className="underline hover:text-blue-500" href={termsUrl}>Terms of Service</Link> and <Link href={privacyUrl}>Privacy Policy</Link>.
      </div>
    </div>
  )
}