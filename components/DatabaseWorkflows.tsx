"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { apiRequest, bhutanDateParts, type AuthUser } from "@/lib/api";
import { ZONES, ZONE_IDS } from "@/lib/data";
import { useApp } from "./context";
import { Badge, Card, Heading } from "./ui";

const stamp=(value:string|null)=>value?new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Thimphu"}):"—";
const formValues=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();return Object.fromEntries(new FormData(event.currentTarget));};
function useResource<T>(path:string){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState("");
  const reload=useCallback(async()=>{try{setData(await apiRequest<T>(path));setError("");}catch(cause){setError(cause instanceof Error?cause.message:"Could not load data");}},[path]);
  useEffect(()=>{void reload();},[reload]);
  return {data,error,reload};
}
function useMutation(){
  const {notify}=useApp();const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const run=async<T,>(path:string,body:unknown,method="POST",done?:(result:T)=>void|Promise<void>)=>{
    setBusy(true);setError("");try{const result=await apiRequest<T>(path,{method,body:JSON.stringify(body)});await done?.(result);notify("Saved to PostgreSQL.");}
    catch(cause){setError(cause instanceof Error?cause.message:"Could not save");}finally{setBusy(false);}
  };return {busy,error,run};
}
function ErrorMessage({text}:{text:string}){return text?<p className="form-error" role="alert">{text}</p>:null;}

export function DatabaseRangers(){
  const {dialog,refreshAccount}=useApp();const resource=useResource<AuthUser[]>("rangers");
  function edit(person?:AuthUser){
    dialog({title:person?"Edit ranger":"Create ranger account",description:"Gewog assignments control this ranger’s access on the server. Updating the account signs out its existing sessions.",
      fields:[{name:"name",label:"Full name",value:person?.name},{name:"email",label:"Login email",type:"email",value:person?.email},
        {name:"phone",label:"Phone",value:person?.phone,required:false},{name:"password",label:person?"New password (optional, at least 12 characters)":"Password (at least 12 characters)",type:"password",required:!person},
        {name:"zones",label:"Assigned gewogs",type:"checkboxes",value:person?.zones.join(","),options:ZONE_IDS.map(code=>({value:code,label:ZONES[code]}))},
        {name:"active",label:"Account status",type:"select",value:person?.active===false?"false":"true",options:[{value:"true",label:"Active"},{value:"false",label:"Suspended"}]},
        {name:"notes",label:"Staff notes",type:"textarea",value:person?.notes,required:false}],
      onSave:async values=>{await apiRequest(person?`rangers/${person.id}`:"rangers",{method:person?"PATCH":"POST",body:JSON.stringify({name:values.name,email:values.email,phone:values.phone,notes:values.notes,
        zones:values.zones.split(",").filter(Boolean).map(Number),active:values.active==="true",...(values.password?{password:values.password}:{})})});await resource.reload();await refreshAccount();}});
  }
  return <><Heading title="Rangers" description="Manage ranger accounts and gewog access"><button className="primary" onClick={()=>edit()}>Add ranger</button></Heading>
    <ErrorMessage text={resource.error}/><Card title="Ranger accounts"><div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Gewogs</th><th>Status</th><th>2FA</th><th/></tr></thead>
      <tbody>{resource.data?.map(person=><tr key={person.id}><td>{person.name}</td><td>{person.email}</td><td>{person.zones.map(code=>ZONES[code]).join(", ")||"Unassigned"}</td><td>{person.active?"Active":"Suspended"}</td><td>{person.mfa_enabled?"Enabled":"Off"}</td><td><button onClick={()=>edit(person)}>Edit</button></td></tr>)}</tbody></table></div>
      {resource.data?.length===0&&<p>No ranger accounts yet. Add a ranger and assign their gewogs.</p>}</Card></>;
}

export interface StoredAlert {id:string;detection_id:string;title:string;gewog_code:number;gewog_name:string;affected_codes:number[];status:string;response:string;assigned_to:string|null;assigned_name:string|null;created_at:string;}
export function DatabaseAlerts(){
  const {role,user,refreshBackend}=useApp();const alerts=useResource<StoredAlert[]>("alerts"),rangers=useResource<AuthUser[]>("rangers");
  const mutation=useMutation();const [selectedId,setSelectedId]=useState("");
  const selected=alerts.data?.find(row=>row.id===selectedId)??alerts.data?.[0];
  const [response,setResponse]=useState(""),[assignee,setAssignee]=useState("");
  useEffect(()=>{setResponse(selected?.response??"");setAssignee(selected?.assigned_to??"");},[selected?.id,selected?.response,selected?.assigned_to]);
  useEffect(()=>{void apiRequest("notifications/read",{method:"POST"}).then(()=>refreshBackend()).catch(()=>{});},[refreshBackend]);
  async function update(status:string){if(selected)await mutation.run(`alerts/${selected.id}`,{status,response,assigned_to:assignee||null},"PATCH",alerts.reload);}
  return <><Heading title="Alerts" description="Automatic high-risk forecasts, ranger assignments and recorded responses"><button onClick={()=>void alerts.reload()}>Refresh</button></Heading>
    <ErrorMessage text={alerts.error||mutation.error}/><div className="workflow-columns"><Card title="Wildlife alerts">
      {alerts.data?.map(row=><button className={`workflow-list-item ${selected?.id===row.id?"selected":""}`} key={row.id} onClick={()=>setSelectedId(row.id)}><strong>{row.title}</strong><span>{row.status} · {stamp(row.created_at)}</span></button>)}
      {alerts.data?.length===0&&<p>No high-risk alerts in your accessible gewogs.</p>}</Card>
      <Card title="Alert response">{selected?<><h3>{selected.title}</h3><Badge tone="red">High risk</Badge><p>Affected gewogs: {selected.affected_codes.map(code=>ZONES[String(code)]).join(", ")}</p>
        <p>Status: <strong>{selected.status}</strong></p>{role==="admin"||user?.zones.includes(String(selected.gewog_code))?<Link href={`/${role}/predictions?detection=${selected.detection_id}`}>View source image and prediction</Link>:<p>Source image access belongs to the assigned source gewog. The affected gewogs are listed above.</p>}
        {role==="admin"?<label>Assigned ranger<select value={assignee} onChange={event=>setAssignee(event.target.value)}><option value="">Unassigned</option>{rangers.data?.filter(person=>person.active&&person.zones.some(code=>[selected.gewog_code,...selected.affected_codes].includes(Number(code)))).map(person=><option value={person.id} key={person.id}>{person.name}</option>)}</select></label>:<p>Assigned ranger: {selected.assigned_name||"Unassigned"}</p>}
        <label>Response / action taken<textarea rows={4} value={response} onChange={event=>setResponse(event.target.value)} maxLength={5000}/></label>
        <div className="button-row wrap"><button disabled={mutation.busy||selected.status!=="New"} onClick={()=>void update("Acknowledged")}>Acknowledge</button>
          <button disabled={mutation.busy} onClick={()=>void update(selected.status)}>Save response</button><button disabled={mutation.busy||selected.status!=="Acknowledged"||!response.trim()} onClick={()=>void update("Resolved")}>Resolve</button></div>
      </>:<p>Select an alert to record a response.</p>}</Card></div></>;
}

interface FieldReport {id:string;title:string;body:string;species:string;author_name:string;gewog_name:string;observed_at:string;created_at:string;status:string;admin_note:string;latitude:number;longitude:number;}
export function FieldReports(){
  const {role,dialog}=useApp();const resource=useResource<FieldReport[]>("reports"),mutation=useMutation();
  const [show,setShow]=useState(false);const local=bhutanDateParts(new Date().toISOString());
  async function submit(event:FormEvent<HTMLFormElement>){const values=formValues(event);
    await mutation.run("reports",{title:values.title,body:values.body,species:values.species,latitude:Number(values.latitude),longitude:Number(values.longitude),observed_at:`${values.observed_at}:00+06:00`},"POST",async()=>{setShow(false);await resource.reload();});}
  function review(row:FieldReport){dialog({title:"Review field report",fields:[{name:"status",label:"Status",type:"select",value:row.status,options:["Submitted","Reviewed","Closed"]},{name:"admin_note",label:"Review note",type:"textarea",value:row.admin_note,required:false}],
    onSave:async values=>{await apiRequest(`reports/${row.id}`,{method:"PATCH",body:JSON.stringify(values)});await resource.reload();}});}
  return <Card title="Field Reports" action={<button onClick={()=>setShow(!show)}>{show?"Cancel":"New field report"}</button>}>
    <ErrorMessage text={resource.error||mutation.error}/>{show&&<form onSubmit={submit} className="workflow-form"><label>Title<input name="title" required maxLength={160}/></label>
      <label>Species<input name="species" required maxLength={120} defaultValue="Asian Elephant"/></label><label>Observed at (Bhutan time)<input type="datetime-local" name="observed_at" required defaultValue={`${local.date}T${local.time}`}/></label>
      <label>Latitude<input name="latitude" type="number" step="any" min={-90} max={90} required/></label><label>Longitude<input name="longitude" type="number" step="any" min={-180} max={180} required/></label>
      <label>Observation and action taken<textarea name="body" required rows={4} maxLength={10000}/></label><button className="primary" disabled={mutation.busy}>{mutation.busy?"Saving…":"Submit report"}</button>
      <p className="muted small">Coordinates must be inside a gewog you can access. Field reports are stored separately from model detections.</p></form>}
    {resource.data?.map(row=><article className="workflow-record" key={row.id}><div className="button-row wrap"><h3>{row.title}</h3><Badge>{row.status}</Badge>{role==="admin"&&<button onClick={()=>review(row)}>Review</button>}</div>
      <p>{row.species} · {row.gewog_name} · {stamp(row.observed_at)} · {row.author_name}</p><p className="preserve-lines">{row.body}</p>{row.admin_note&&<p><strong>Review note:</strong> {row.admin_note}</p>}</article>)}
    {resource.data?.length===0&&<p>No field reports yet.</p>}</Card>;
}

export function ReviewActions({id,note:initialNote}:{id:string;note:string}){
  const {role,refreshBackend}=useApp();const [note,setNote]=useState(initialNote);const mutation=useMutation();
  const resource=useResource<Array<{id:number;name:string;created_at:string;details:{status:string;note:string;flagged:boolean}}>>(`sightings/${id}/review`);
  useEffect(()=>setNote(initialNote),[id,initialNote]);
  async function save(status?:string,flagged?:boolean){await mutation.run(`sightings/${id}/review`,{note,...(status?{status}:{}),...(flagged!==undefined?{flagged}:{})},"PATCH",async()=>{await refreshBackend();await resource.reload();});}
  return <section className="workflow-review"><h3>Review and audit notes</h3><ErrorMessage text={mutation.error||resource.error}/>
    <label>Note<textarea value={note} onChange={event=>setNote(event.target.value)} rows={3} maxLength={5000}/></label>
    <div className="button-row wrap"><button disabled={mutation.busy} onClick={()=>void save()}>Save note</button>
      {role==="admin"?<><button disabled={mutation.busy} onClick={()=>void save("Approved",false)}>Approve</button><button disabled={mutation.busy} onClick={()=>void save("Rejected",false)}>Reject</button></>
        :<button disabled={mutation.busy||!note.trim()} onClick={()=>void save(undefined,true)}>Flag for admin review</button>}</div>
    <details><summary>Review history ({resource.data?.length??0})</summary>{resource.data?.map(row=><p key={row.id}>{stamp(row.created_at)} · {row.name} · {row.details.status}{row.details.flagged?" · Flagged":""}<br/>{row.details.note}</p>)}</details>
  </section>;
}

export function ReviewQueue(){
  const {data,role,setSelectedId}=useApp();
  const rows=data.sightings.filter(row=>row.flagged||row.review==="Needs review");
  return <Card title={`Awaiting review (${rows.length})`}><div className="table-scroll"><table><thead><tr><th>Sighting</th><th>Gewog</th><th>Flag</th><th/></tr></thead>
    <tbody>{rows.map(row=><tr key={row.id}><td>{row.species} · {row.date} {row.time}</td><td>{ZONES[row.zone]}</td><td>{row.flagged?"Flagged":"Needs review"}</td><td><Link onClick={()=>setSelectedId(row.id)} href={`/${role}/sightings`}>Review sighting</Link></td></tr>)}</tbody></table></div>{!rows.length&&<p>No loaded sightings are awaiting review.</p>}</Card>;
}

interface Activity {id:number;action:string;created_at:string;}
export function DatabaseAccount(){
  const {user,refreshAccount,signOut}=useApp();const mutation=useMutation();const activity=useResource<Activity[]>("audit");
  const [secret,setSecret]=useState(""),[codes,setCodes]=useState<string[]>([]);
  if(!user)return null;
  async function profile(event:FormEvent<HTMLFormElement>){const values=formValues(event);await mutation.run("auth/profile",{name:values.name,phone:values.phone,preferences:user!.preferences},"PATCH",async()=>{await refreshAccount();await activity.reload();});}
  async function password(event:FormEvent<HTMLFormElement>){const values=formValues(event);if(values.password!==values.confirm){return;}await mutation.run("auth/password",{current:values.current,password:values.password,code:values.code||""},"POST",activity.reload);}
  async function factor(event:FormEvent<HTMLFormElement>){const values=formValues(event);const path=user!.mfa_enabled?"disable":secret?"enable":"setup";
    await mutation.run<{secret?:string;recovery_codes?:string[]}>(`auth/mfa/${path}`,{password:values.password||"",code:values.code||""},"POST",async result=>{if(result.secret)setSecret(result.secret);if(result.recovery_codes){setCodes(result.recovery_codes);setSecret("");}await refreshAccount();await activity.reload();});}
  async function preference(key:string,value:boolean){await mutation.run("auth/profile",{name:user!.name,phone:user!.phone,preferences:{...user!.preferences,[key]:value}},"PATCH",refreshAccount);}
  return <><Heading title="My Account" description="Profile, password, authenticator and notification preferences"/><ErrorMessage text={mutation.error}/>
    <div className="workflow-columns"><div className="stack"><Card title="Profile"><form className="workflow-form" onSubmit={profile} key={user.id}>
      <label>Name<input name="name" required maxLength={120} defaultValue={user.name}/></label><label>Login email<input value={user.email} readOnly/></label><label>Phone<input name="phone" maxLength={40} defaultValue={user.phone}/></label>
      <p>{user.role} · {user.zones.map(code=>ZONES[code]).join(", ")}</p><p>Created {stamp(user.created_at)} · Last login {stamp(user.last_login)}</p><button disabled={mutation.busy}>Save profile</button></form></Card>
      <Card title="Change password"><form className="workflow-form" onSubmit={password}><label>Current password<input name="current" type="password" autoComplete="current-password" required/></label>
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required/></label><label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" required onInput={event=>{const input=event.currentTarget;const next=(input.form?.elements.namedItem("password") as HTMLInputElement)?.value;input.setCustomValidity(input.value===next?"":"Passwords do not match");}}/></label>
        {user.mfa_enabled&&<label>Authenticator or recovery code<input name="code" required autoComplete="one-time-code"/></label>}<button disabled={mutation.busy}>Change password</button><p className="muted small">Other sessions are signed out after the password changes.</p></form></Card>
    </div><div className="stack"><Card title={`Two-factor authentication · ${user.mfa_enabled?"Enabled":"Off"}`}><form className="workflow-form" onSubmit={factor}>
      {!secret&&<label>Current password<input type="password" name="password" required autoComplete="current-password"/></label>}
      {secret&&<><p>Add this setup key to your authenticator app, then enter its six-digit code. Setup expires in 10 minutes.</p><code className="setup-secret">{secret}</code></>}
      {(secret||user.mfa_enabled)&&<label>Authenticator or recovery code<input name="code" required autoComplete="one-time-code"/></label>}
      <button disabled={mutation.busy}>{user.mfa_enabled?"Disable 2FA":secret?"Verify and enable":"Set up authenticator"}</button></form>
      {!!codes.length&&<div><strong>Save these one-use recovery codes now.</strong><pre>{codes.join("\n")}</pre><button onClick={()=>{const blob=new Blob([codes.join("\n")],{type:"text/plain"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="rikhanet-recovery-codes.txt";link.click();URL.revokeObjectURL(url);}}>Download recovery codes</button><button onClick={()=>setCodes([])}>I saved them</button></div>}</Card>
      <Card title="Notifications"><label className="check-option"><input type="checkbox" disabled={mutation.busy} checked={user.preferences.wildlife_alerts!==false} onChange={event=>void preference("wildlife_alerts",event.target.checked)}/>Email wildlife alerts</label><p className="muted small">In-app alerts remain available. Email delivery starts after your administrator configures SMTP.</p></Card>
      <Card title="Account activity">{activity.data?.slice(0,10).map(row=><p key={row.id}>{stamp(row.created_at)} · {row.action}</p>)}<button onClick={signOut}>Sign out</button></Card>
    </div></div></>;
}

interface SystemSettings {config:{threshold:number;advisory:number;interval:number};delivery:{email_configured:boolean;webhook_configured:boolean};outbox:Array<{id:number;channel:string;status:string;attempts:number;last_error:string;created_at:string}>;}
export function DatabaseSettings(){
  const resource=useResource<SystemSettings>("settings"),activity=useResource<Activity[]>("audit"),mutation=useMutation();const {refreshAccount}=useApp();
  async function submit(event:FormEvent<HTMLFormElement>){const values=formValues(event);await mutation.run("settings",{threshold:Number(values.threshold),advisory:Number(values.advisory),interval:Number(values.interval)},"PATCH",async()=>{await resource.reload();await refreshAccount();});}
  return <><Heading title="Settings & System Status" description="Persistent settings and notification delivery status"/><ErrorMessage text={resource.error||mutation.error}/>
    <div className="workflow-columns"><Card title="Application settings">{resource.data&&<form className="workflow-form" onSubmit={submit}>
      <label>Detection confidence threshold<input name="threshold" type="number" min={0} max={1} step=".01" defaultValue={resource.data.config.threshold} required/></label>
      <label>Forecast advisory setting (%)<input name="advisory" type="number" min={0} max={100} defaultValue={resource.data.config.advisory} required/></label>
      <label>Planning interval (hours)<input name="interval" type="number" min={1} max={24} defaultValue={resource.data.config.interval} required/></label><button disabled={mutation.busy}>Save settings</button>
      <p className="muted small">The stored advisory and planning settings do not change the TFT risk thresholds or create scheduled predictions.</p></form>}</Card>
      <Card title="Notification delivery"><p>Email: <strong>{resource.data?.delivery.email_configured?"Configured":"Awaiting SMTP configuration"}</strong></p><p>Ranger webhook: <strong>{resource.data?.delivery.webhook_configured?"Configured":"Awaiting webhook configuration"}</strong></p>
        <p>In-app high-risk alerts are created automatically. External deliveries wait in PostgreSQL until configured, then retry after failures.</p><p className="muted small">Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, RIKHANET_ALERT_WEBHOOK_URL and RIKHANET_WEBHOOK_SECRET (at least 32 characters) on the backend, then restart it.</p>
        <button disabled={mutation.busy} onClick={()=>void mutation.run("notifications/retry",{},"POST",resource.reload)}>Retry failed deliveries</button></Card>
      <Card title="Delivery queue"><div className="table-scroll"><table><thead><tr><th>Channel</th><th>Status</th><th>Attempts</th><th>Error</th></tr></thead><tbody>{resource.data?.outbox.map(row=><tr key={row.id}><td>{row.channel}</td><td>{row.status}</td><td>{row.attempts}</td><td>{row.last_error||"—"}</td></tr>)}</tbody></table></div></Card>
      <Card title="Audit activity">{activity.data?.slice(0,20).map(row=><p key={row.id}>{stamp(row.created_at)} · {row.action}</p>)}</Card>
    </div></>;
}
