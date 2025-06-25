import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { set, useForm } from "react-hook-form"
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from "zod"
import { FolderContext } from "@/contexts/folder-context"
import { useContext, useEffect, useRef, useState } from "react"
import { Folder } from "@/data/client/models"
import { Credenza, CredenzaClose, CredenzaContent, CredenzaDescription, CredenzaFooter, CredenzaHeader, CredenzaTitle, CredenzaTrigger } from "./credenza"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { KeyContext } from "@/contexts/key-context";
import { DatabaseContext } from "@/contexts/db-context";
import { PutKeyResponse } from "@/data/client/key-api-client";
import { Textarea } from "./ui/textarea";
import { CopyIcon, EyeIcon, EyeOffIcon, PrinterIcon, WandIcon } from "lucide-react";
import { KeyPrint } from "./key-print";
import { pdf, Document, Page } from '@react-pdf/renderer';
import assert from "assert";

function getRandomSixDigit() {
  return Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000;
}
export function SharedKeyEditPopup() {
  const keysContext = useContext(KeyContext);
  const dbContext = useContext(DatabaseContext);
  const [open, setOpen] = useState(false)
  let randomKey = useRef<number>(getRandomSixDigit());
  const [apiResult, setApiResult] = useState<PutKeyResponse | null>(null);
  const [sharedKey, setSharedKey] = useState(randomKey.current.toString());
  const [validFor, setValidFor] = useState("0");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      displayName: randomKey.current.toString().slice(0,2) + '****',
      sharedKey: randomKey.current,
      validFor: 24 * 7
    },
    resolver: zodResolver(
      z.object({
        displayName: z.string().min(2, "Key name is required"),
        sharedKey: z.string().min(6, "Key is required - min. length is 6").or(z.number().min(6, "Key is required - min. length is 6")),
      }),
    ),
  })

  useEffect(() => {
    randomKey.current = getRandomSixDigit();
    setValue('sharedKey', randomKey.current);
    setValue('displayName', randomKey.current.toString().slice(0,2) + '****');
  }, [apiResult])


  const onSubmit = async (data) => {

    setSharedKey(data.sharedKey);
    const expDate = (parseInt(validFor) === 0) ? null : new Date(Date.now() + parseInt(validFor) * 3600 * 1000);
    assert(dbContext?.databaseId, "Database Id is required");
    setApiResult(await keysContext.addKey(dbContext?.databaseId, data.displayName, data.sharedKey.toString(), expDate, { role: 'guest', features: ['*'] }));
    keysContext.loadKeys();

    if(apiResult && apiResult.status === 200) {
      setOpen(false);
      reset();
    }
  }
  return (
    <Credenza open={open} onOpenChange={setOpen}>
      <CredenzaTrigger asChild>
        <Button variant="outline" className="absolute right-10" size="icon">
          <PlusIcon className="w-6 h-6" />
        </Button>
      </CredenzaTrigger>
      <CredenzaContent className="sm:max-w-[500px] bg-white dark:bg-zinc-950" side="top">
          <CredenzaHeader>
            <CredenzaTitle>Add Shared Key</CredenzaTitle>
            <CredenzaDescription>
              Add Shared key so other users can access your database. <br />You can revoke access at any time.
            </CredenzaDescription>
          </CredenzaHeader>
          <div className="p-4">
            {(apiResult && apiResult.status === 200) ? (
              <div className="grid grid-cols-1 gap-4">
                <h2 className="text-green-500 text-bold">Congratulations!</h2>
                <p className="text-sm">Shared Keys has been successfully created. Share the Database Id and Shared Key with a person you like to share data with. Please store the credentials in safe place as they are <strong>NEVER send to server</strong> and thus <strong>CAN NOT be recovered</strong></p>
                <div className="border-2 border-dashed border-green-400 p-5">
                  <div className="text-sm mb-5">
                    <Label htmlFor="databaseId">Database ID:</Label>
                    <Input id="databaseId" readOnly value={dbContext?.databaseId} />
                  </div>
                  <div className="text-sm">
                    <Label htmlFor="sharedKey">Shared Key:</Label>
                    <Textarea id="sharedKey" readOnly value={sharedKey} />
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <Button variant="outline" className="p-1 h-10 p-2" onClick={async (e) => {
                    e.preventDefault();
                    const keyPrinterPdf = pdf(KeyPrint({ key: sharedKey, databaseId: dbContext?.databaseId ?? '' }));
                    const blob = await keyPrinterPdf.toBlob();
                    const url = URL.createObjectURL(blob);
                    
                    // Create a temporary anchor element and click it (works better on iOS Safari)
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'shared-key.pdf';
                    link.target = '_blank';
                    link.style.display = 'none';
                    
                    // Add to DOM, click, and remove
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    // Clean up the blob URL
                    setTimeout(() => URL.revokeObjectURL(url), 100);
                  }}><PrinterIcon className="w-4 h-4" /> Print</Button>
                  <Button variant="outline" className="p-1 h-10 p-2" onClick={async (e) => {
                    e.preventDefault();
                    const textToCopy = 'Database Id: '+ dbContext?.databaseId + "\nKey Id: " + sharedKey;
                    if ('clipboard' in navigator) {
                      navigator.clipboard.writeText(textToCopy);
                    } else {
                      document.execCommand('copy', true, textToCopy);
                    }                
                  }}><CopyIcon className="w-4 h-4" /> Copy to clipboard</Button>             
                </div>

                <CredenzaFooter>
                  <div className="flex gap-2 place-content-end">
                    <CredenzaClose asChild>
                      <Button variant="outline" onClick={(e) => {
                        setApiResult(null);
                      }}>Back to app</Button>
                    </CredenzaClose>
                  </div>
                </CredenzaFooter>                
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Key name</Label>
                    <Input id="displayName" autoFocus error={errors.displayName?.message} {...register("displayName")} />
                    {errors.displayName && <p className="text-red-500 text-sm">{errors.displayName.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sharedKey">Key</Label>
                    <Input id="sharedKey"  error={errors.sharedKey?.message} {...register("sharedKey")} />
                    {errors.sharedKey && <p className="text-red-500 text-sm">{errors.sharedKey.message}</p>}
                  </div>                
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validFor">Key valid for</Label>
                  <Select id="validFor" value={validFor} onValueChange={setValidFor}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Forever" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Forever</SelectItem>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="3">3 hours</SelectItem>
                      <SelectItem value="24">1 day</SelectItem>
                      <SelectItem value="168">1 week</SelectItem>
                      <SelectItem value="744">1 month</SelectItem>
                      <SelectItem value="8928">1 year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <CredenzaFooter>
                  <div className="flex gap-2 place-content-end">
                    <Button type="submit">Save</Button>
                    <CredenzaClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </CredenzaClose>
                  </div>
                </CredenzaFooter>
              </form>
            )}
          </div>
      </CredenzaContent>
    </Credenza>
  )
}


function PlusIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}
