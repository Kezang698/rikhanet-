"use client";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, type AuthUser } from "@/lib/api";
import { useSession } from "./AppProvider";
import { Artwork } from "./ui";

export function SecureLogin() {
  const { login } = useSession();
  const [mode,setMode]=useState<"login"|"setup"|"forgot"|"reset">("login");
  const [token,setToken]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [mfa,setMfa]=useState(false),[checking,setChecking]=useState(true);
  useEffect(()=>{
    const reset=new URLSearchParams(window.location.search).get("reset");
    if(reset){setToken(reset);setMode("reset");setChecking(false);return;}
    void apiRequest<{setup_required:boolean}>("auth/status").then(result=>setMode(result.setup_required?"setup":"login"))
      .catch(cause=>setError(cause.message)).finally(()=>setChecking(false));
  },[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");setMessage("");
    const fields=Object.fromEntries(new FormData(event.currentTarget));
    try{
      if(mode==="forgot"){
        const result=await apiRequest<{message:string}>("auth/forgot",{method:"POST",body:JSON.stringify({email:fields.email})});setMessage(result.message);
      }else if(mode==="reset"){
        const result=await apiRequest<{message:string}>("auth/reset",{method:"POST",body:JSON.stringify({token,password:fields.password,code:fields.code||""})});
        setMessage(result.message);setMode("login");window.history.replaceState({},"","/login");
      }else{
        const result=await apiRequest<{user?:AuthUser;mfa_required?:boolean}>(`auth/${mode}`,{method:"POST",body:JSON.stringify({email:fields.email,password:fields.password,code:fields.code||"",...(mode==="setup"?{name:fields.name}:{})})});
        if(result.mfa_required){setMfa(true);setMessage("Enter the code from your authenticator, or an unused recovery code.");}
        else if(result.user) await login(result.user.role);
      }
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not complete sign-in");}
    finally{setBusy(false);}
  }
  return <main className="login-page"><div className="login-shell">
    <div className="login-hero"><Artwork source={1} rect={[8,8,386,458]} label="RiKhaNET wildlife monitoring"/></div>
    <section className="login-form-side"><form className="login-form" onSubmit={submit}>
      <h2>Welcome to</h2><h1>RiKhaNET</h1>
      <p>{mode==="setup"?"Create the first administrator account":mode==="forgot"?"Request a password reset":mode==="reset"?"Choose a new password":"Sign in to your account"}</p>
      {mode==="setup"&&<label>Full name<input name="name" required maxLength={120} autoComplete="name"/></label>}
      {mode!=="reset"&&<label>Email<input name="email" type="email" required maxLength={254} autoComplete="username"/></label>}
      {mode!=="forgot"&&<label>Password<input name="password" type="password" required minLength={mode==="login"?1:12} maxLength={256} autoComplete={mode==="login"?"current-password":"new-password"}/></label>}
      {(mfa||mode==="reset")&&<label>Authenticator or recovery code{mode==="reset"?" (if 2FA is enabled)":""}<input name="code" autoComplete="one-time-code" maxLength={80} required={mfa}/></label>}
      {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
      <button className="primary sign-in" disabled={busy||checking}>{busy?"Please wait…":checking?"Connecting…":mode==="setup"?"Create administrator":mode==="forgot"?"Send reset email":mode==="reset"?"Reset password":"Sign in"}</button>
      {mode!=="setup"&&<button type="button" className="text-button" onClick={()=>{setMode(mode==="login"?"forgot":"login");setError("");setMessage("");}}>{mode==="login"?"Forgot password?":"Back to sign in"}</button>}
      <p className="muted small">{mode==="setup"?"Choose a password with at least 12 characters. Ranger accounts are created by your administrator.":"Access is controlled by your account and assigned gewogs."}</p>
    </form></section>
  </div></main>;
}
