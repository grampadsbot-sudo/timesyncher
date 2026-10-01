// expect empty-catch
try { work(); } catch (error) {}
---
// expect empty-catch
try { work(); } catch (error) { /* ignore */ }
---
// expect empty-catch
try { work(); } catch (error) {
  // swallowed
}
---
// expect empty-catch
promise.catch(() => {});
---
// expect empty-catch
promise.catch(function (error) { /* no-op */ });
---
// expect none
try { work(); } catch (error) { throw error; }
---
// expect none
try { work(); } catch (error) { console.error(error); }
---
// expect none
promise.catch(() => 0);
---
// expect none
promise.catch((error) => { console.error(error); });
