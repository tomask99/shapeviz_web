export function retryDelay(value, now=Date.now()) {
  if(!value)return 0;
  const seconds=Number(value);
  const delay=Number.isFinite(seconds) ? seconds*1000 : Date.parse(value)-now;
  return Number.isFinite(delay) ? Math.max(0,delay) : 0;
}

export async function retryUpload(operation, progress, label, {sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),random=Math.random}={}) {
  for(let attempt=0;attempt<4;attempt++) {
    try {return await operation();}
    catch(error) {
      const transient=[408,429,500,502,503,504,520,522,524,544].includes(error.status) ||
        (!error.status && ['TypeError','TimeoutError','AbortError'].includes(error.name));
      const requested=retryDelay(error.retryAfter);
      if(!transient || attempt===3 || requested>60000)throw error;
      const delay=Math.max(requested,2000*2**attempt+Math.floor(random()*500));
      progress(`${label}: retry ${attempt+1}/3 in ${Math.ceil(delay/1000)}s…`);
      await sleep(delay);
    }
  }
}
