import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
  } from "@/components/ui/drawer"
import { Button } from "./ui/button"
import { RecordContext } from "@/contexts/record-context";
import { FolderContext } from "@/contexts/folder-context";
import { useContext } from "react";
import { FilterIcon, TagIcon, RefreshCw as RefreshIcon } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function RecordsFilter({}) {

    const recordContext = useContext(RecordContext);
    const folderContext = useContext(FolderContext);

    const handleRefresh = async () => {
        if (folderContext?.currentFolder && recordContext?.checkAndRefreshRecords) {
            await recordContext.checkAndRefreshRecords(folderContext.currentFolder, true);
        }
    };

    const formatLastRefreshed = (date: Date | null) => {
        if (!date) return '';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
      <div className="flex items-center gap-2">
        <Drawer open={recordContext?.filtersOpen} onOpenChange={recordContext?.setFiltersOpen}>
          <DrawerTrigger asChild>
            <Button variant="outline" className="h-10"><FilterIcon />Sort &amp; filter ...</Button>
          </DrawerTrigger>
          <DrawerContent className="bg-white dark:bg-zinc-950">
            <div className="mx-auto w-full h-[500px]">
              <DrawerHeader>
                <DrawerTitle className="content-left text-left">Filters
                  <Select onValueChange={(v) => {
                    if (folderContext?.currentFolder) {
                      recordContext?.setSortBy(v);
                    }
                  }}>
                    <SelectTrigger className="w-[180px] absolute top-8 right-4">
                        <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                              <SelectItem value="eventDate desc">Event date desc</SelectItem>
                                <SelectItem value="eventDate asc">Event date asc</SelectItem>
                                <SelectItem value="createdAt desc">Record created desc</SelectItem>
                                <SelectItem value="createdAt asc">Record created asc</SelectItem>
                                <SelectItem value="updatedAt desc">Updated desc</SelectItem>
                                <SelectItem value="updatedAt asc">Updated asc</SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                  </DrawerTitle>
                </DrawerHeader>
                <div className="p-4 pb-0 overflow-y-auto h-[380px] max-h-screen">
                  <div className="flex items-center justify-center space-y-auto">
                  {recordContext?.filterAvailableTags && recordContext?.filterAvailableTags.length > 0 ? (
                    <div className="p-2 flex flex-wrap items-center gap-1 w-full ">
                    {recordContext.filterAvailableTags.sort((a,b) => a.tag.localeCompare(b.tag)).map((tag, index) => (
                      <div key={index} className="text-sm inline-flex w-auto"><Button className="h-10" variant={recordContext.filterSelectedTags.includes(tag.tag) ? 'default' : 'secondary' } onClick={() => { 
                        if (folderContext?.currentFolder) {
                          recordContext?.filterToggleTag(tag.tag);
                          recordContext.setFiltersOpen(false);
                        }
                      }
                      }><TagIcon className="w-4 h-4 mr-2" /> {tag.tag +' (' + tag.freq + ')'}</Button></div>
                    ))}
                  </div>      
                  ) : ''}                 
                  </div>
                </div>
                <DrawerFooter>
                  <DrawerClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>
          <Button variant="outline" className="h-10 ml-2" onClick={handleRefresh}><RefreshIcon className="w-4 h-4 mr-2" />Refresh</Button>
          {recordContext?.lastRefreshed && (
            <span className="text-xs text-muted-foreground ml-1">
                {formatLastRefreshed(recordContext.lastRefreshed)}
            </span>
          )}
      </div>
    )
}