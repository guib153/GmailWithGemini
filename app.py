import streamlit as st
import pandas as pd

def process_inventory(df, col_mapping):
    """
    Process the inventory dataframe by mapping columns and aggregating.
    """
    # Rename columns based on mapping
    df_renamed = df.rename(columns={
        col_mapping['symbol_col']: '股票代號',
        col_mapping['name_col']: '股票名稱',
        col_mapping['shares_col']: '股數',
        col_mapping['cost_col']: '成本'
    })
    
    # Check if necessary columns exist
    required_cols = ['股票代號', '股數', '成本']
    for col in required_cols:
        if col not in df_renamed.columns:
            st.error(f"找不到對應的欄位: {col}，請檢查 CSV 或欄位映射設定！")
            return None
            
    # Convert '股數' and '成本' to numeric, replacing commas and coercing errors
    df_renamed['股數'] = pd.to_numeric(df_renamed['股數'].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
    df_renamed['成本'] = pd.to_numeric(df_renamed['成本'].astype(str).str.replace(',', ''), errors='coerce').fillna(0)

    # Aggregation: Group by '股票代號' (and '股票名稱' if it exists in the original file)
    groupby_cols = ['股票代號']
    if '股票名稱' in df_renamed.columns:
        groupby_cols.append('股票名稱')
        
    df_merged = df_renamed.groupby(groupby_cols, as_index=False).agg({
        '股數': 'sum',
        '成本': 'sum'
    })
    
    return df_merged

def main():
    st.set_page_config(page_title="台股庫存管理系統", layout="wide")
    st.title("📈 台股庫存管理系統 (V2.0 Web UI)")
    
    # Sidebar - Column mapping settings
    st.sidebar.header("⚙️ CSV 欄位映射設定")
    st.sidebar.markdown("請輸入您的 CSV 檔案中對應的欄位名稱：")
    
    symbol_col = st.sidebar.text_input("股票代號欄位名稱", value="股票代號")
    name_col = st.sidebar.text_input("股票名稱欄位名稱", value="股票名稱")
    shares_col = st.sidebar.text_input("股數欄位名稱", value="股數")
    cost_col = st.sidebar.text_input("成本欄位名稱", value="成本")
    
    col_mapping = {
        'symbol_col': symbol_col,
        'name_col': name_col,
        'shares_col': shares_col,
        'cost_col': cost_col
    }
    
    # Main area - File uploader
    st.header("上傳庫存 CSV 檔案")
    uploaded_file = st.file_uploader("請選擇包含庫存資訊的 CSV 檔案", type=['csv'])
    
    if uploaded_file is not None:
        try:
            # Read CSV
            df = pd.read_csv(uploaded_file)
            
            st.subheader("📋 原始資料 (Raw Data)")
            st.dataframe(df)
            
            # Process and aggregate
            st.subheader("📊 合併後庫存 (Merged Inventory)")
            df_merged = process_inventory(df, col_mapping)
            
            if df_merged is not None:
                st.dataframe(df_merged)
                
                # Verification logic: Check if sum of raw equals sum of merged
                raw_shares_sum = pd.to_numeric(df[col_mapping['shares_col']].astype(str).str.replace(',', ''), errors='coerce').fillna(0).sum()
                raw_cost_sum = pd.to_numeric(df[col_mapping['cost_col']].astype(str).str.replace(',', ''), errors='coerce').fillna(0).sum()
                
                merged_shares_sum = df_merged['股數'].sum()
                merged_cost_sum = df_merged['成本'].sum()
                
                st.divider()
                st.subheader("✅ 資料比對與驗證結果")
                
                # Ensure the aggregation match
                if abs(raw_shares_sum - merged_shares_sum) < 0.01 and abs(raw_cost_sum - merged_cost_sum) < 0.01:
                    st.success("驗證通過：原始資料的總數與合併後庫存的總數一致！")
                else:
                    st.warning("警告：總數可能存在差異，請檢查資料格式是否包含無法解析的內容。")

                col1, col2 = st.columns(2)
                col1.metric("原始總股數 vs 合併總股數", f"{raw_shares_sum:,.0f}", f"Diff: {merged_shares_sum - raw_shares_sum:,.0f}")
                col2.metric("原始總成本 vs 合併總成本", f"{raw_cost_sum:,.2f}", f"Diff: {merged_cost_sum - raw_cost_sum:,.2f}")
                
        except Exception as e:
            st.error(f"讀取或解析 CSV 時發生錯誤: {e}")

if __name__ == "__main__":
    main()
