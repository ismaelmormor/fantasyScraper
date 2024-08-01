from playwright.sync_api import sync_playwright

def fetch_div_content_with_playwright(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        # Navegar a la URL
        page.goto(url)
        
        # Esperar a que el elemento div.pct esté presente en el DOM
        page.wait_for_selector('div.pct')
        
        # Obtener el contenido del div.pct
        div_content = page.query_selector('div.pct').inner_text()
        
        print(div_content)  # Imprime el contenido del div.pct
        
        browser.close()

url = 'https://www.futbolfantasy.com/jugadores/jan-oblak'
fetch_div_content_with_playwright(url)
